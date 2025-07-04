import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { Prisma, TransactionType, Transaction, Wallet, PayRequest } from "@prisma/client"
import prisma from "../client"
import { SubscribeToInvoiceInvoiceUpdatedEvent } from "lightning"
import lightningService from "./lightning.service"
import userService from "./user.service"
import logger from "../config/logger"
import config from "../config/config"

/**
 * Get wallet by user id
 * @param {number} userId
 * @param {boolean} throwOnDisabled
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

  if (throwOnDisabled && (user.wallet.disabled || user.wallet.busy)) {
    throw new ApiError(httpStatus.FORBIDDEN, "Request forbidden")
  }

  return user.wallet
}

const _impactDeposit = async (
  invoice: SubscribeToInvoiceInvoiceUpdatedEvent,
  walletTransaction: Transaction
) => {
  return prisma.$transaction(async (tx) => {
    if (walletTransaction.walletImpacted || !invoice.is_confirmed) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Wallet already has this funds impacted or invoice is not confirmed"
      )
    }

    const wallet = await tx.wallet.findUnique({
      where: { id: walletTransaction.walletId },
    })

    if (!wallet) {
      throw new ApiError(httpStatus.NOT_FOUND, "Wallet not found")
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceInSats: wallet.balanceInSats + invoice.tokens },
    })

    await tx.transaction.update({
      where: { id: walletTransaction.id },
      data: { walletImpacted: true, invoiceSettled: invoice.is_confirmed, invoice },
    })
  })
}

const _setWalletBusy = async (walletId: number, busy: boolean) => {
  return prisma.wallet.update({ where: { id: walletId }, data: { busy } })
}

const createDepositInvoice = async (userId: number, sats: number): Promise<Transaction> => {
  return prisma.$transaction(async (tx) => {
    const wallet = await getUserWallet(userId, true)

    if (config.wallet.limit > 0 && wallet.balanceInSats + sats > config.wallet.limit) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Not allowed to deposit more than " + config.wallet.limit + " sats"
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
        invoice,
      },
    })

    return pendingTransaction
  })
}

const payWithdrawInvoice = async (userId: number, invoice: string): Promise<Transaction> => {
  const wallet = await getUserWallet(userId, true)

  await _setWalletBusy(wallet.id, true)

  const payment = await lightningService.decodeInvoice(invoice)

  const balanceInSats = wallet.balanceInSats

  const isZeroValue = payment.tokens === 0

  const amountInSats = isZeroValue
    ? balanceInSats - Math.round(balanceInSats / 100)
    : payment.tokens

  const feeReserve = Math.round(amountInSats / 100)
  const total = amountInSats + feeReserve

  if (balanceInSats < total) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Not enough balance to pay the fee, try a lower amount or use a zero-value invoice to withdraw all available balance minus fee."
    )
  }

  return prisma
    .$transaction(
      async (tx) => {
        const transaction = await tx.transaction.create({
          data: {
            amountInSats,
            type: TransactionType.WITHDRAW,
            invoice,
            invoiceSettled: true,
            walletImpacted: true,
            wallet: { connect: { id: wallet.id } },
          },
        })

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balanceInSats: { decrement: total } },
        })

        await lightningService.payInvoice(
          invoice,
          (payment as any).payment_hash,
          isZeroValue ? amountInSats : undefined
        )

        await _setWalletBusy(wallet.id, false)

        return transaction
      },
      { maxWait: 5000, timeout: 25000 }
    )
    .finally(async () => {
      await _setWalletBusy(wallet.id, false)
    })
}

const getTransaction = async (txId: number, userId?: number) => {
  const walletId = userId ? (await userService.getUserWithWallet(userId))?.id : undefined

  if (!walletId) {
    throw new ApiError(httpStatus.NOT_FOUND, "Wallet not found")
  }

  const transaction = await prisma.transaction.findUnique({ where: { id: txId, walletId } })

  if (!transaction) {
    if (userId) {
      throw new ApiError(httpStatus.FORBIDDEN, "This transaction is not from this user")
    }
    throw new ApiError(httpStatus.NOT_FOUND, "Transaction not found")
  }

  return transaction
}

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
  return prisma.$transaction(async (tx) => {
    const payerWallet = await getUserWallet(payerId, true)

    if (payerWallet.balanceInSats < amountInSats) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
    }

    const payeeWallet = await getUserWallet(receiverId, true)

    await tx.wallet.update({
      where: { id: payerWallet.id },
      data: {
        balanceInSats: {
          decrement: amountInSats,
        },
      },
      select: { id: true },
    })

    await tx.wallet.update({
      where: { id: payeeWallet.id },
      data: {
        balanceInSats: {
          increment: amountInSats,
        },
      },
      select: { id: true },
    })

    await tx.transaction.create({
      data: {
        walletImpacted: true,
        invoiceSettled: true,
        amountInSats: amountInSats,
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
  })
}

const createPayRequests = async ({
  creatorId,
  receiverIds,
  amountInSats,
  description,
  meta,
}: Pick<PayRequest, "amountInSats" | "creatorId" | "description" | "meta"> & {
  receiverIds: Array<PayRequest["id"]>
}) => {
  return prisma.$transaction(async (tx) => {
    const prs = []
    for (const receiverId of receiverIds) {
      const pr = await tx.payRequest.create({
        data: {
          amountInSats,
          creator: {
            connect: {
              id: creatorId,
            },
          },
          receiver: {
            connect: {
              id: receiverId,
            },
          },
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
  })
}

const createPayRequest = async ({
  creatorId,
  receiverId,
  amountInSats,
  description,
  meta,
}: Pick<PayRequest, "amountInSats" | "creatorId" | "receiverId" | "description" | "meta">) => {
  return prisma.payRequest.create({
    data: {
      amountInSats,
      creator: {
        connect: {
          id: creatorId,
        },
      },
      receiver: {
        connect: {
          id: receiverId,
        },
      },
      description,
      meta: meta as Prisma.JsonObject,
    },
    include: {
      creator: { select: { id: true } },
      receiver: { select: { id: true } },
    },
  })
}

const payRequest = async ({ payerId, payRequestId }: { payerId: number; payRequestId: number }) => {
  return await prisma.$transaction(async (tx) => {
    const pr = await prisma.payRequest.findUnique({
      where: { id: payRequestId, receiverId: payerId },
    })

    if (!pr) {
      throw new ApiError(httpStatus.NOT_FOUND, "Pay request not found")
    }

    if (pr.paid) {
      throw new ApiError(httpStatus.FOUND, "Pay request already paid")
    }

    const payerWallet = await getUserWallet(payerId, true)

    if (payerWallet.balanceInSats < pr.amountInSats) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
    }

    const payeeWallet = await getUserWallet(pr?.creatorId, true)

    await tx.wallet.update({
      where: { id: payerWallet.id },
      data: {
        balanceInSats: {
          decrement: pr.amountInSats,
        },
      },
      select: { id: true },
    })

    await tx.wallet.update({
      where: { id: payeeWallet.id },
      data: {
        balanceInSats: {
          increment: pr.amountInSats,
        },
      },
      select: { id: true },
    })

    await tx.payRequest.update({
      where: { id: pr.id },
      data: { paid: true },
      select: { id: true },
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
  })
}

const getPayRequest = async (id: PayRequest["id"]) => {
  return prisma.payRequest.findUnique({
    where: { id },
    include: {
      receiver: {
        select: { id: true, email: true, name: true, role: true },
      },
      creator: {
        select: { id: true, email: true, name: true, role: true },
      },
    },
  })
}

const getPayRequests = async (ids: Array<PayRequest["id"]>) => {
  return prisma.payRequest.findMany({
    where: { OR: ids.map((id) => ({ id })) },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      receiver: { select: { id: true, name: true, email: true } },
    },
  })
}

export default {
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
