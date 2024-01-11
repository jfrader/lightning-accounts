import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { Prisma, TransactionType, Transaction, Wallet, PayRequest } from "@prisma/client"
import prisma from "../client"
import { SubscribeToInvoiceInvoiceUpdatedEvent } from "lightning"
import lightningService from "./lightning.service"
import userService from "./user.service"

/**
 * Get wallet by user id
 * @param {number} userId
 * @returns {Promise<Wallet>}
 */
const getUserWallet = async (userId: number): Promise<Omit<Wallet, "createdAt" | "updatedAt">> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: { select: { id: true, userId: true, balanceInSats: true, disabled: true } },
    },
  })

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }

  if (!user.wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, "Wallet not found")
  }

  return user.wallet
}

const _impactDeposit = async (
  invoice: SubscribeToInvoiceInvoiceUpdatedEvent,
  walletTransaction: Transaction
) => {
  return prisma.$transaction(
    async (tx) => {
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
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  )
}

const createDepositInvoice = async (userId: number, sats: number): Promise<Transaction> => {
  const wallet = await getUserWallet(userId)

  return prisma.$transaction(
    async (tx) => {
      const invoice = await lightningService.createInvoice(sats, (settledInvoice) => {
        _impactDeposit(settledInvoice, pendingTransaction)
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
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  )
}

const getTransaction = async (txId: number, userId?: number) => {
  const walletId = userId ? (await userService.getUserWithWallet(userId))?.id : undefined
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
}: {
  payerId: number
  receiverId: number
  amountInSats: number
}) => {
  return await prisma.$transaction(
    async (tx) => {
      const payerWallet = await getUserWallet(payerId)

      if (payerWallet.balanceInSats < amountInSats) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
      }

      const payeeWallet = await getUserWallet(receiverId)

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
          type: TransactionType.SEND,
          wallet: { connect: { id: payerWallet.id } },
        },
      })
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  )
}

const withdrawToInvoice = async (userId: number, invoice: string) => {
  const wallet = await getUserWallet(userId)
  const { tokens } = await lightningService.decodeInvoice(invoice)

  const updated = await prisma.$transaction(
    async (tx) => {
      if (wallet.balanceInSats - tokens < 0) {
        throw new ApiError(httpStatus.FORBIDDEN, "Insufficient balance")
      }

      await lightningService.payInvoice(invoice)

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceInSats: wallet.balanceInSats - tokens },
      })
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  )

  return updated
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
  return await prisma.$transaction(
    async (tx) => {
      const pr = await prisma.payRequest.findUnique({
        where: { id: payRequestId, receiverId: payerId },
      })

      if (!pr) {
        throw new ApiError(httpStatus.NOT_FOUND, "Pay request not found")
      }

      const payerWallet = await getUserWallet(payerId)

      if (payerWallet.balanceInSats < pr.amountInSats) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient balance")
      }

      const payeeWallet = await getUserWallet(pr?.creatorId)

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
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  )
}

const getPayRequest = async (id: PayRequest["id"]) => {
  return prisma.payRequest.findUnique({ where: { id }, include: { receiver: true, creator: true } })
}

const getPayRequests = async (ids: Array<PayRequest["id"]>) => {
  return prisma.payRequest.findMany({
    where: { OR: ids.map((id) => ({ id })) },
    include: { receiver: true, creator: true },
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
  withdrawToInvoice,
  getTransaction,
}
