import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { Prisma, TransactionType, Transaction, Wallet } from "@prisma/client"
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

export default {
  getUserWallet,
  createDepositInvoice,
  withdrawToInvoice,
  getTransaction,
}
