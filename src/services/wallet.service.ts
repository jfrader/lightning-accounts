import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { Prisma, TransactionType, Transaction, Wallet, PayRequest } from "@prisma/client"
import prisma from "../client"
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
 * Reconcile pending Lightning transactions against the node's durable payment history
 * @param {boolean} dryRun - If true, log actions without applying changes (default: false)
 * @returns {Promise<void>}
 */
const checkInconsistentTransactions = async (dryRun = false): Promise<void> => {
  try {
    logger.info(`Starting reconciliation (dryRun=${dryRun})`)

    const inconsistentTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          {
            type: TransactionType.DEPOSIT,
            OR: [{ walletImpacted: false }, { invoiceSettled: false }, { invoiceSettled: null }],
          },
          {
            type: TransactionType.WITHDRAW,
            OR: [
              { walletImpacted: true, invoiceSettled: false },
              { walletImpacted: false, invoiceSettled: true },
            ],
          },
        ],
      },
      orderBy: { id: "asc" },
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

    let failures = 0
    for (const tx of inconsistentTransactions) {
      logger.info(
        `Processing transaction ${tx.id} for user ${tx.wallet.userId}: walletImpacted=${tx.walletImpacted}, invoiceSettled=${tx.invoiceSettled}`
      )

      const invoice = tx.invoice as { id: string; request: string } | null
      if (!invoice?.id || !invoice?.request) {
        logger.error(`Transaction ${tx.id}: No valid invoice data`)
        failures++
        continue
      }

      try {
        if (tx.type === TransactionType.DEPOSIT) {
          const status = await retry(() => lightningService.checkInvoice(invoice.id))
          logger.info(`Transaction ${tx.id}: confirmed=${status.is_confirmed}, dryRun=${dryRun}`)
          if (status.is_confirmed && !dryRun) await _impactDeposit(status, tx)
          if (!status.is_confirmed && tx.walletImpacted) {
            throw new Error("Credited deposit lacks settlement evidence; manual review required")
          }
        } else {
          const status = await retry(() => lightningService.checkPayment(invoice.id))
          logger.info(
            `Transaction ${tx.id}: confirmed=${status.is_confirmed}, failed=${status.is_failed}, dryRun=${dryRun}`
          )
          if (!dryRun) await _reconcileWithdrawal(tx, status)
        }
      } catch (error: any) {
        logger.error(`Transaction ${tx.id}: Failed to reconcile - ${error.message}`)
        failures++
      }
    }

    if (failures > 0) throw new Error(`Failed to reconcile ${failures} transaction(s)`)
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

  const settlement: { transaction?: Transaction; earlyInvoice?: SettledInvoice } = {}
  const transaction = await prisma.$transaction(async (tx) => {
    const wallet = await getUserWallet(userId, true)

    const walletLimit = config.wallet.limit > 0 ? config.wallet.limit : MAX_WALLET_SATS

    if (wallet.balanceInSats > walletLimit - sats) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Not allowed to hold more than ${walletLimit} sats`
      )
    }

    const invoice = await lightningService.createInvoice(sats, (settledInvoice) => {
      if (settlement.transaction) {
        _impactDeposit(settledInvoice, settlement.transaction).catch((e) => logger.error(e.message))
      } else {
        settlement.earlyInvoice = settledInvoice
      }
    })

    return tx.transaction.create({
      data: {
        type: TransactionType.DEPOSIT,
        amountInSats: sats,
        walletImpacted: false,
        walletId: wallet.id,
        invoiceSettled: false,
        invoice: { id: invoice.id, request: invoice.request },
      },
    })
  }, PRISMA_TRANSACTION_OPTS)
  settlement.transaction = transaction
  if (settlement.earlyInvoice) await _impactDeposit(settlement.earlyInvoice, transaction)
  return prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } })
}

type SettledInvoice = { id: string; tokens: number; is_confirmed?: boolean }

/**
 * Impact deposit on wallet balance
 * @param invoice - Confirmed invoice
 * @param walletTransaction - Transaction record
 * @returns {Promise}
 */
const _impactDeposit = async (invoice: SettledInvoice, walletTransaction: Transaction) => {
  return prisma.$transaction(async (tx) => {
    if (!invoice.is_confirmed) {
      logger.info(
        `Transaction ${walletTransaction.id}: Skipping impact because invoice is not confirmed`
      )
      return
    }

    const current = await tx.transaction.findUniqueOrThrow({ where: { id: walletTransaction.id } })
    const storedInvoice = current.invoice as { id?: string; request?: string } | null
    assertPositiveSats(invoice.tokens)
    if (
      current.type !== TransactionType.DEPOSIT ||
      storedInvoice?.id !== invoice.id ||
      invoice.tokens !== current.amountInSats
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Settled invoice does not match transaction")
    }

    const claimedTransaction = await tx.transaction.updateMany({
      where: {
        id: walletTransaction.id,
        type: TransactionType.DEPOSIT,
        walletId: current.walletId,
        invoice: { path: ["id"], equals: invoice.id },
        walletImpacted: false,
      },
      data: { walletImpacted: true, invoiceSettled: true },
    })

    if (claimedTransaction.count !== 1) {
      await tx.transaction.updateMany({
        where: { id: current.id, walletImpacted: true },
        data: { invoiceSettled: true },
      })
      logger.info(`Transaction ${walletTransaction.id}: Deposit already impacted`)
      return
    }

    const creditedWallet = await tx.wallet.updateMany({
      where: {
        id: current.walletId,
        balanceInSats: { lte: MAX_WALLET_SATS - invoice.tokens },
      },
      data: { balanceInSats: { increment: invoice.tokens } },
    })

    if (creditedWallet.count !== 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Wallet balance limit exceeded")
    }

    await tx.transaction.update({
      where: { id: walletTransaction.id },
      data: { invoice: { ...storedInvoice, ...invoice } },
    })

    logger.info(`Transaction ${walletTransaction.id}: Deposited ${invoice.tokens} satoshis`)
  }, PRISMA_TRANSACTION_OPTS)
}

const _reconcileWithdrawal = async (
  transaction: Transaction,
  status: { is_confirmed?: boolean; is_failed?: boolean }
) => {
  if (!status.is_confirmed && !status.is_failed) return
  const total = transaction.amountInSats + Math.round(transaction.amountInSats / 20)
  return prisma.$transaction(async (tx) => {
    if (status.is_confirmed) {
      const claim = await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          type: TransactionType.WITHDRAW,
          walletImpacted: false,
          invoiceSettled: true,
        },
        data: { walletImpacted: true },
      })
      if (claim.count === 1) {
        const debit = await tx.wallet.updateMany({
          where: { id: transaction.walletId, balanceInSats: { gte: total } },
          data: { balanceInSats: { decrement: total } },
        })
        if (debit.count !== 1) throw new Error("Insufficient balance for confirmed withdrawal")
      }
      await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          type: TransactionType.WITHDRAW,
          walletImpacted: true,
          invoiceSettled: false,
        },
        data: { invoiceSettled: true },
      })
    } else {
      const claim = await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          type: TransactionType.WITHDRAW,
          walletImpacted: true,
          invoiceSettled: false,
        },
        data: { walletImpacted: false },
      })
      if (claim.count === 1) {
        const refund = await tx.wallet.updateMany({
          where: { id: transaction.walletId, balanceInSats: { lte: MAX_WALLET_SATS - total } },
          data: { balanceInSats: { increment: total } },
        })
        if (refund.count !== 1) throw new Error("Wallet balance limit exceeded on refund")
      }
    }
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
          walletImpacted: true,
          wallet: { connect: { id: wallet.id } },
        },
      })

      return newTransaction
    }, PRISMA_TRANSACTION_OPTS)

    try {
      await lightningService.payInvoice(invoice, isZeroValue ? amountInSats : undefined)
      await _reconcileWithdrawal(transaction, { is_confirmed: true })
    } catch (error: any) {
      logger.error(
        `Payment outcome requires reconciliation for transaction ${transaction.id}: ${error.message}`
      )
      try {
        await _reconcileWithdrawal(transaction, await lightningService.checkPayment(payment.id))
      } catch (lookupError: any) {
        logger.error(`Transaction ${transaction.id}: Payment lookup failed: ${lookupError.message}`)
      }
      const current = await prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } })
      if (!current.invoiceSettled) {
        if (current.walletImpacted) {
          throw new ApiError(
            httpStatus.SERVICE_UNAVAILABLE,
            `Payment unresolved: ${transaction.id}`
          )
        }
        throw new ApiError(httpStatus.BAD_REQUEST, `Payment failed: ${transaction.id}`)
      }
    }

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
