import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { Prisma, TransactionType, Transaction, Wallet, PayRequest } from "@prisma/client"
import prisma from "../client"
import { SubscribeToInvoiceInvoiceUpdatedEvent } from "lightning"
import lightningService, { LND_TIMEOUT } from "./lightning.service"
import logger from "../config/logger"
import config from "../config/config"
import { setWalletBusy, clearWalletBusy, isWalletBusy } from "./lock.service"

const PRISMA_TRANSACTION_OPTS = { maxWait: 10000, timeout: LND_TIMEOUT + 5000 }
const MAX_WALLET_SATS = 2_147_483_647

const assertPositiveSats = (amountInSats: number) => {
  if (!Number.isSafeInteger(amountInSats) || amountInSats <= 0 || amountInSats > MAX_WALLET_SATS) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Amount must be a positive integer number of sats")
  }
}

/**
 * Check for inconsistent transactions (walletImpacted !== invoiceSettled) and attempt to reconcile
 * @param {boolean} dryRun - If true, log actions without applying changes (default: false)
 * @returns {Promise<void>}
 */
const checkInconsistentTransactions = async (dryRun = false): Promise<void> => {
  try {
    logger.info(`Starting reconciliation (dryRun=${dryRun})`)

    const inconsistentTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { walletImpacted: true, invoiceSettled: false },
          { walletImpacted: false, invoiceSettled: true },
        ],
      },
      include: {
        wallet: { select: { userId: true, balanceInSats: true } },
      },
    })

    if (inconsistentTransactions.length === 0) {
      logger.info(`No inconsistent transactions found (dryRun=${dryRun})`)
      return
    }

    logger.warn(
      `Found ${inconsistentTransactions.length} inconsistent transactions (dryRun=${dryRun})`
    )

    // Retry utility for Lightning service calls
    const retry = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
      try {
        return await fn()
      } catch (error) {
        if (retries === 0) throw error
        await new Promise((resolve) => setTimeout(resolve, delay))
        return retry(fn, retries - 1, delay)
      }
    }

    for (const tx of inconsistentTransactions) {
      logger.info(
        `Processing transaction ${tx.id} for user ${tx.wallet.userId}: walletImpacted=${tx.walletImpacted}, invoiceSettled=${tx.invoiceSettled}`
      )

      const invoice = tx.invoice as { id: string; request: string } | null
      if (!invoice?.id || !invoice?.request) {
        logger.error(`Transaction ${tx.id}: No valid invoice data`)
        if (!dryRun) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { walletImpacted: false, invoiceSettled: false },
          })
        }
        logger.info(
          `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as failed due to invalid invoice data`
        )
        continue
      }

      try {
        const invoiceStatus = await retry(() => lightningService.checkInvoice(invoice.id))
        logger.info(
          `Transaction ${tx.id}: Invoice ${invoice.id} status - confirmed=${invoiceStatus.is_confirmed}`
        )

        if (tx.type === TransactionType.DEPOSIT) {
          if (tx.walletImpacted && !tx.invoiceSettled) {
            if (invoiceStatus.is_confirmed) {
              if (!dryRun) {
                await prisma.transaction.update({
                  where: { id: tx.id },
                  data: { invoiceSettled: true },
                })
              }
              logger.info(
                `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as invoiceSettled=true (deposit confirmed)`
              )
            } else {
              const wallet = await prisma.wallet.findUnique({ where: { id: tx.walletId } })
              if (!wallet) {
                logger.error(`Wallet ${tx.walletId} not found`)
                continue
              }
              const currentBalance = wallet.balanceInSats
              const newBalance = currentBalance - tx.amountInSats
              if (!dryRun) {
                await prisma.$transaction(async (txPrisma) => {
                  await txPrisma.transaction.update({
                    where: { id: tx.id },
                    data: { walletImpacted: false },
                  })
                  await txPrisma.wallet.update({
                    where: { id: tx.walletId },
                    data: { balanceInSats: { decrement: tx.amountInSats } },
                  })
                }, PRISMA_TRANSACTION_OPTS)
                logger.info(
                  `Transaction ${tx.id}: Reverted deposit, balance changed from ${currentBalance} to ${newBalance}`
                )
              } else {
                logger.info(
                  `[DRY RUN] Transaction ${tx.id}: Would revert deposit, changing balance from ${currentBalance} to ${newBalance}`
                )
              }
            }
          } else if (!tx.walletImpacted && tx.invoiceSettled) {
            if (invoiceStatus.is_confirmed) {
              const wallet = await prisma.wallet.findUnique({ where: { id: tx.walletId } })
              if (!wallet) {
                logger.error(`Wallet ${tx.walletId} not found`)
                continue
              }
              const currentBalance = wallet.balanceInSats
              const newBalance = currentBalance + tx.amountInSats
              if (!dryRun) {
                await prisma.$transaction(async (txPrisma) => {
                  await txPrisma.transaction.update({
                    where: { id: tx.id },
                    data: { walletImpacted: true },
                  })
                  await txPrisma.wallet.update({
                    where: { id: tx.walletId },
                    data: { balanceInSats: { increment: tx.amountInSats } },
                  })
                }, PRISMA_TRANSACTION_OPTS)
                logger.info(
                  `Transaction ${tx.id}: Applied deposit, balance changed from ${currentBalance} to ${newBalance}`
                )
              } else {
                logger.info(
                  `[DRY RUN] Transaction ${tx.id}: Would apply deposit, changing balance from ${currentBalance} to ${newBalance}`
                )
              }
            } else {
              if (!dryRun) {
                await prisma.transaction.update({
                  where: { id: tx.id },
                  data: { invoiceSettled: false },
                })
              }
              logger.info(
                `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as invoiceSettled=false (deposit not confirmed)`
              )
            }
          }
        } else if (tx.type === TransactionType.WITHDRAW) {
          if (tx.walletImpacted && !tx.invoiceSettled) {
            if (invoiceStatus.is_confirmed) {
              if (!dryRun) {
                await prisma.transaction.update({
                  where: { id: tx.id },
                  data: { invoiceSettled: true },
                })
              }
              logger.info(
                `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as invoiceSettled=true (withdrawal confirmed)`
              )
            } else {
              const feeReserve = Math.round(tx.amountInSats / 20)
              const total = tx.amountInSats + feeReserve
              const wallet = await prisma.wallet.findUnique({ where: { id: tx.walletId } })
              if (!wallet) {
                logger.error(`Wallet ${tx.walletId} not found`)
                continue
              }
              const currentBalance = wallet.balanceInSats
              const newBalance = currentBalance + total
              if (!dryRun) {
                await prisma.$transaction(async (txPrisma) => {
                  await txPrisma.transaction.update({
                    where: { id: tx.id },
                    data: { walletImpacted: false, invoiceSettled: false },
                  })
                  await txPrisma.wallet.update({
                    where: { id: tx.walletId },
                    data: { balanceInSats: { increment: total } },
                  })
                }, PRISMA_TRANSACTION_OPTS)
                logger.info(
                  `Transaction ${tx.id}: Reverted withdrawal, balance changed from ${currentBalance} to ${newBalance}`
                )
              } else {
                logger.info(
                  `[DRY RUN] Transaction ${tx.id}: Would revert withdrawal, increasing balance by ${total} to ${newBalance}`
                )
              }
            }
          } else if (!tx.walletImpacted && tx.invoiceSettled) {
            if (invoiceStatus.is_confirmed) {
              const feeReserve = Math.round(tx.amountInSats / 20)
              const total = tx.amountInSats + feeReserve
              const wallet = await prisma.wallet.findUnique({ where: { id: tx.walletId } })
              if (!wallet) {
                logger.error(`Wallet ${tx.walletId} not found`)
                continue
              }
              const currentBalance = wallet.balanceInSats
              if (currentBalance < total) {
                logger.error(
                  `Transaction ${tx.id}: Insufficient balance for deducted withdrawal, current balance: ${currentBalance}, required: ${total}`
                )
                if (!dryRun) {
                  await prisma.transaction.update({
                    where: { id: tx.id },
                    data: { invoiceSettled: false },
                  })
                }
                logger.info(
                  `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as invoiceSettled=false due to insufficient balance`
                )
              } else {
                const newBalance = currentBalance - total
                if (!dryRun) {
                  await prisma.$transaction(async (txPrisma) => {
                    await txPrisma.transaction.update({
                      where: { id: tx.id },
                      data: { walletImpacted: true },
                    })
                    await txPrisma.wallet.update({
                      where: { id: tx.walletId },
                      data: { balanceInSats: { decrement: total } },
                    })
                  }, PRISMA_TRANSACTION_OPTS)
                  logger.info(
                    `Transaction ${tx.id}: Applied withdrawal, balance changed from ${currentBalance} to ${newBalance}`
                  )
                } else {
                  logger.info(
                    `[DRY RUN] Transaction ${tx.id}: Would apply withdrawal, decreasing balance by ${total} to ${newBalance}`
                  )
                }
              }
            } else {
              if (!dryRun) {
                await prisma.transaction.update({
                  where: { id: tx.id },
                  data: { invoiceSettled: false },
                })
              }
              logger.info(
                `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as invoiceSettled=false (withdrawal not confirmed)`
              )
            }
          }
        }
      } catch (error: any) {
        logger.error(`Transaction ${tx.id}: Failed to reconcile - ${error.message}`)
        if (!dryRun) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { walletImpacted: false, invoiceSettled: false },
          })
        }
        logger.info(
          `[DRY RUN=${dryRun}] Transaction ${tx.id}: Marked as failed due to reconciliation error`
        )
      }
    }

    logger.info(`Reconciliation completed (dryRun=${dryRun})`)
  } catch (error: any) {
    logger.error(`Failed to check inconsistent transactions: ${error.message}`)
    throw error
  }
}

/**
 * Get wallet by user ID
 * @param userId - User ID
 * @param throwOnDisabled - Throw error if wallet is disabled or busy
 * @returns {Promise<Wallet>}
 */
const getUserWallet = async (
  userId: number,
  throwOnDisabled = false
): Promise<Omit<Wallet, "createdAt" | "updatedAt">> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: {
        select: { id: true, userId: true, balanceInSats: true, disabled: true, busy: true },
      },
    },
  })

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }

  if (!user.wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, "Wallet not found")
  }

  if (throwOnDisabled) {
    if (user.wallet.disabled) {
      throw new ApiError(httpStatus.FORBIDDEN, "Wallet is disabled")
    }
    if (isWalletBusy(user.wallet.id)) {
      throw new ApiError(httpStatus.FORBIDDEN, "Wallet is currently busy")
    }
  }

  return user.wallet
}

/**
 * Create a Lightning invoice for deposits
 * @param userId - User ID
 * @param sats - Amount in satoshis
 * @returns {Promise<Transaction>}
 */
const createDepositInvoice = async (userId: number, sats: number): Promise<Transaction> => {
  assertPositiveSats(sats)

  return prisma.$transaction(async (tx) => {
    const wallet = await getUserWallet(userId, true)

    const walletLimit = config.wallet.limit > 0 ? config.wallet.limit : MAX_WALLET_SATS

    if (wallet.balanceInSats > walletLimit - sats) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Not allowed to hold more than ${walletLimit} sats`
      )
    }

    const invoice = await lightningService.createInvoice(sats, (settledInvoice) => {
      _impactDeposit(settledInvoice, pendingTransaction).catch((e) => logger.error(e.message))
    })

    const pendingTransaction = await tx.transaction.create({
      data: {
        type: TransactionType.DEPOSIT,
        amountInSats: sats,
        walletImpacted: false,
        walletId: wallet.id,
        invoiceSettled: false,
        invoice: { id: invoice.id, request: invoice.request },
      },
    })

    return pendingTransaction
  }, PRISMA_TRANSACTION_OPTS)
}

/**
 * Impact deposit on wallet balance
 * @param invoice - Confirmed invoice
 * @param walletTransaction - Transaction record
 * @returns {Promise}
 */
const _impactDeposit = async (
  invoice: SubscribeToInvoiceInvoiceUpdatedEvent,
  walletTransaction: Transaction
) => {
  assertPositiveSats(invoice.tokens)
  if (invoice.tokens !== walletTransaction.amountInSats) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Settled invoice amount does not match transaction")
  }

  return prisma.$transaction(async (tx) => {
    if (!invoice.is_confirmed) {
      logger.info(
        `Transaction ${walletTransaction.id}: Skipping impact because invoice is not confirmed`
      )
      return
    }

    const claimedTransaction = await tx.transaction.updateMany({
      where: {
        id: walletTransaction.id,
        walletId: walletTransaction.walletId,
        walletImpacted: false,
      },
      data: { walletImpacted: true, invoiceSettled: true },
    })

    if (claimedTransaction.count !== 1) {
      logger.info(`Transaction ${walletTransaction.id}: Deposit already impacted`)
      return
    }

    const creditedWallet = await tx.wallet.updateMany({
      where: {
        id: walletTransaction.walletId,
        balanceInSats: { lte: MAX_WALLET_SATS - invoice.tokens },
      },
      data: { balanceInSats: { increment: invoice.tokens } },
    })

    if (creditedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Wallet balance limit exceeded")
    }

    await tx.transaction.update({
      where: { id: walletTransaction.id },
      data: { invoice },
    })

    logger.info(`Transaction ${walletTransaction.id}: Deposited ${invoice.tokens} satoshis`)
  }, PRISMA_TRANSACTION_OPTS)
}

/**
 * Pay a withdrawal invoice
 * @param userId - User ID
 * @param invoice - Lightning invoice
 * @returns {Promise<Transaction>}
 */
const payWithdrawInvoice = async (userId: number, invoice: string): Promise<Transaction> => {
  const wallet = await getUserWallet(userId, true)

  // Attempt to lock the wallet
  if (!setWalletBusy(wallet.id)) {
    throw new ApiError(httpStatus.FORBIDDEN, "Wallet is currently busy")
  }

  try {
    const payment = await lightningService.decodeInvoice(invoice)

    if (!Number.isSafeInteger(payment.tokens) || payment.tokens < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invoice amount is invalid")
    }

    const balanceInSats = wallet.balanceInSats
    const isZeroValue = payment.tokens === 0
    const amountInSats = isZeroValue
      ? balanceInSats - Math.round(balanceInSats / 20)
      : payment.tokens
    assertPositiveSats(amountInSats)
    const feeReserve = Math.round(amountInSats / 20)
    const total = amountInSats + feeReserve

    if (!Number.isSafeInteger(total) || total > MAX_WALLET_SATS) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invoice amount is too large")
    }

    logger.info(
      `Transaction for withdrawal: amount=${amountInSats}, fee=${feeReserve}, total=${total}, wallet balance=${balanceInSats}`
    )

    if (balanceInSats < total) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Not enough balance to pay the fee, try a lower amount or use a zero-value invoice to withdraw all available balance minus fee."
      )
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const debitedWallet = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          disabled: false,
          balanceInSats: { gte: total },
        },
        data: { balanceInSats: { decrement: total } },
      })

      if (debitedWallet.count !== 1) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
      }

      const newTransaction = await tx.transaction.create({
        data: {
          amountInSats,
          type: TransactionType.WITHDRAW,
          invoice: { id: payment.id, request: invoice },
          invoiceSettled: false,
          walletImpacted: false,
          wallet: { connect: { id: wallet.id } },
        },
      })

      try {
        await lightningService.payInvoice(invoice, isZeroValue ? amountInSats : undefined)
        await tx.transaction.update({
          where: { id: newTransaction.id },
          data: { invoiceSettled: true, walletImpacted: true },
        })
      } catch (error: any) {
        logger.error(`Failed to pay invoice for transaction ${newTransaction.id}: ${error.message}`)
        throw new ApiError(httpStatus.BAD_REQUEST, `Payment failed: ${error.message}`)
      }

      return newTransaction
    }, PRISMA_TRANSACTION_OPTS)

    return await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    })
  } finally {
    // Always clear the busy state, even on error
    clearWalletBusy(wallet.id)
  }
}

/**
 * Pay another user
 * @param params - Payer, receiver, amount, and description
 * @returns {Promise<Transaction>}
 */
const payUser = async ({
  payerId,
  receiverId,
  amountInSats,
  description,
}: {
  payerId: number
  receiverId: number
  amountInSats: number
  description?: string
}) => {
  assertPositiveSats(amountInSats)
  if (payerId === receiverId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot pay the same wallet")
  }

  return prisma.$transaction(async (tx) => {
    const payerWallet = await getUserWallet(payerId, true)
    const payeeWallet = await getUserWallet(receiverId, true)

    const debitedWallet = await tx.wallet.updateMany({
      where: {
        id: payerWallet.id,
        disabled: false,
        balanceInSats: { gte: amountInSats },
      },
      data: { balanceInSats: { decrement: amountInSats } },
    })

    if (debitedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
    }

    const creditedWallet = await tx.wallet.updateMany({
      where: {
        id: payeeWallet.id,
        disabled: false,
        balanceInSats: { lte: MAX_WALLET_SATS - amountInSats },
      },
      data: { balanceInSats: { increment: amountInSats } },
    })

    if (creditedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Receiver wallet balance limit exceeded")
    }

    await tx.transaction.create({
      data: {
        walletImpacted: true,
        invoiceSettled: true,
        amountInSats,
        description,
        type: TransactionType.RECEIVE,
        wallet: { connect: { id: payeeWallet.id } },
      },
      select: { id: true },
    })

    return tx.transaction.create({
      data: {
        walletImpacted: true,
        invoiceSettled: true,
        amountInSats,
        description,
        type: TransactionType.SEND,
        wallet: { connect: { id: payerWallet.id } },
      },
    })
  }, PRISMA_TRANSACTION_OPTS)
}

/**
 * Create multiple pay requests
 * @param params - Creator, receivers, amount, description, meta
 * @returns {Promise<PayRequest[]>}
 */
const createPayRequests = async ({
  creatorId,
  receiverIds,
  amountInSats,
  description,
  meta,
}: Pick<PayRequest, "amountInSats" | "creatorId" | "description" | "meta"> & {
  receiverIds: Array<PayRequest["id"]>
}) => {
  assertPositiveSats(amountInSats)
  if (receiverIds.length === 0 || new Set(receiverIds).size !== receiverIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Receivers must be a non-empty unique list")
  }
  if (receiverIds.includes(creatorId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot request payment from the same wallet")
  }

  return prisma.$transaction(async (tx) => {
    const prs = []
    for (const receiverId of receiverIds) {
      const pr = await tx.payRequest.create({
        data: {
          amountInSats,
          creator: { connect: { id: creatorId } },
          receiver: { connect: { id: receiverId } },
          description,
          meta: meta as Prisma.JsonObject,
        },
        include: {
          creator: { select: { id: true } },
          receiver: { select: { id: true } },
        },
      })
      prs.push(pr)
    }
    return prs
  }, PRISMA_TRANSACTION_OPTS)
}

/**
 * Create a single pay request
 * @param params - Creator, receiver, amount, description, meta
 * @returns {Promise<PayRequest>}
 */
const createPayRequest = async ({
  creatorId,
  receiverId,
  amountInSats,
  description,
  meta,
}: Pick<PayRequest, "amountInSats" | "creatorId" | "receiverId" | "description" | "meta">) => {
  assertPositiveSats(amountInSats)
  if (creatorId === receiverId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Cannot request payment from the same wallet")
  }

  return prisma.payRequest.create({
    data: {
      amountInSats,
      creator: { connect: { id: creatorId } },
      receiver: { connect: { id: receiverId } },
      description,
      meta: meta as Prisma.JsonObject,
    },
    include: {
      creator: { select: { id: true } },
      receiver: { select: { id: true } },
    },
  })
}

/**
 * Pay a pay request
 * @param params - Payer ID and pay request ID
 * @returns {Promise<PayRequest>}
 */
const payRequest = async ({ payerId, payRequestId }: { payerId: number; payRequestId: number }) => {
  return prisma.$transaction(async (tx) => {
    const pr = await tx.payRequest.findUnique({
      where: { id: payRequestId },
    })

    if (!pr || pr.receiverId !== payerId) {
      throw new ApiError(httpStatus.NOT_FOUND, "Pay request not found")
    }

    if (pr.paid) {
      throw new ApiError(httpStatus.CONFLICT, "Pay request already paid")
    }

    assertPositiveSats(pr.amountInSats)

    const payerWallet = await getUserWallet(payerId, true)
    const payeeWallet = await getUserWallet(pr.creatorId, true)

    const claimedRequest = await tx.payRequest.updateMany({
      where: { id: pr.id, receiverId: payerId, paid: false },
      data: { paid: true },
    })

    if (claimedRequest.count !== 1) {
      throw new ApiError(httpStatus.CONFLICT, "Pay request already paid")
    }

    const debitedWallet = await tx.wallet.updateMany({
      where: {
        id: payerWallet.id,
        disabled: false,
        balanceInSats: { gte: pr.amountInSats },
      },
      data: { balanceInSats: { decrement: pr.amountInSats } },
    })

    if (debitedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
    }

    const creditedWallet = await tx.wallet.updateMany({
      where: {
        id: payeeWallet.id,
        disabled: false,
        balanceInSats: { lte: MAX_WALLET_SATS - pr.amountInSats },
      },
      data: { balanceInSats: { increment: pr.amountInSats } },
    })

    if (creditedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Receiver wallet balance limit exceeded")
    }

    const updatedPr = await tx.payRequest.findUniqueOrThrow({
      where: { id: pr.id },
      include: {
        creator: { select: { id: true } },
        receiver: { select: { id: true } },
      },
    })

    await tx.transaction.create({
      data: {
        walletImpacted: true,
        invoiceSettled: true,
        amountInSats: pr.amountInSats,
        type: TransactionType.SEND,
        wallet: { connect: { id: payerWallet.id } },
        payRequest: { connect: { id: pr.id } },
      },
      select: { id: true },
    })

    await tx.transaction.create({
      data: {
        walletImpacted: true,
        invoiceSettled: true,
        amountInSats: pr.amountInSats,
        type: TransactionType.RECEIVE,
        wallet: { connect: { id: payeeWallet.id } },
        payRequest: { connect: { id: pr.id } },
      },
      select: { id: true },
    })

    return updatedPr
  }, PRISMA_TRANSACTION_OPTS)
}

/**
 * Get a pay request
 * @param id - Pay request ID
 * @returns {Promise<PayRequest | null>}
 */
const getPayRequest = async (id: PayRequest["id"], userId: number) => {
  return prisma.payRequest.findFirst({
    where: { id, OR: [{ creatorId: userId }, { receiverId: userId }] },
    include: {
      receiver: { select: { id: true, email: true, name: true, role: true } },
      creator: { select: { id: true, email: true, name: true, role: true } },
    },
  })
}

/**
 * Get multiple pay requests
 * @param ids - Array of pay request IDs
 * @returns {Promise<PayRequest[]>}
 */
const getPayRequests = async (ids: Array<PayRequest["id"]>, userId: number) => {
  return prisma.payRequest.findMany({
    where: {
      id: { in: ids },
      OR: [{ creatorId: userId }, { receiverId: userId }],
    },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  })
}

/**
 * Get a transaction
 * @param txId - Transaction ID
 * @param userId - Optional user ID
 * @returns {Promise<Transaction>}
 */
const getTransaction = async (txId: number, userId?: number) => {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: txId,
      ...(userId ? { wallet: { userId } } : {}),
    },
  })

  if (!transaction) {
    if (userId) {
      throw new ApiError(httpStatus.FORBIDDEN, "This transaction is not from this user")
    }
    throw new ApiError(httpStatus.NOT_FOUND, "Transaction not found")
  }

  return transaction
}

export default {
  checkInconsistentTransactions,
  payUser,
  createPayRequest,
  createPayRequests,
  getPayRequest,
  getPayRequests,
  payRequest,
  getUserWallet,
  createDepositInvoice,
  payWithdrawInvoice,
  getTransaction,
}
