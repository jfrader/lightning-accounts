import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import catchAsync from "../utils/catchAsync"
import walletService from "../services/wallet.service"
import { User } from "@prisma/client"

const createDeposit = catchAsync(async (req, res) => {
  const { amountInSats } = req.body
  const user = req.user as User

  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to create deposit, user not found")
  }

  const transaction = await walletService.createDepositInvoice(user.id, amountInSats)
  res.status(httpStatus.CREATED).send(transaction)
})

const getDeposit = catchAsync(async (req, res) => {
  const transactionId = req.params.transactionId
  const user = req.user as User

  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to create deposit, user not found")
  }

  const transaction = await walletService.getTransaction(transactionId, user.id)
  res.send(transaction)
})

export default {
  createDeposit,
  getDeposit,
}
