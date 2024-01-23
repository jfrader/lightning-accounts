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

const createPayRequest = catchAsync(async (req, res) => {
  const user = req.user as User

  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to create pay request, user not found")
  }

  const receiverId = req.body.receiverId
  const amountInSats = req.body.amountInSats
  const description = req.body.description
  const meta = req.body.meta

  const pr = await walletService.createPayRequest({
    creatorId: user.id,
    receiverId,
    amountInSats,
    description,
    meta,
  })

  if (!pr) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create pay request")
  }

  res.send(pr)
})

const createPayRequests = catchAsync(async (req, res) => {
  const user = req.user as User

  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to create pay request, user not found")
  }

  const receiverIds = req.body.receiverIds
  const amountInSats = req.body.amountInSats
  const description = req.body.description
  const meta = req.body.meta

  const prs = await walletService.createPayRequests({
    creatorId: user.id,
    receiverIds,
    amountInSats,
    description,
    meta,
  })

  if (!prs) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create pay requests")
  }

  res.send(prs)
})

const getPayRequest = catchAsync(async (req, res) => {
  const id = req.params.payRequestId

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Need to supply an id")
  }

  const pr = await walletService.getPayRequest(id)
  res.send(pr)
})

const getPayRequests = catchAsync(async (req, res) => {
  const ids = req.body.payRequestIds

  if (!ids || !ids.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Need to supply at least one id")
  }

  const pr = await walletService.getPayRequests(ids)
  res.send(pr)
})

const payUser = catchAsync(async (req, res) => {
  const user = req.user as User
  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to create pay request, user not found")
  }

  const receiverId = req.body.userId
  const amountInSats = req.body.amountInSats
  const description = req.body.description

  const tx = await walletService.payUser({
    payerId: user.id,
    receiverId,
    amountInSats,
    description,
  })
  res.send(tx)
})

const payRequest = catchAsync(async (req, res) => {
  const id = req.params.payRequestId
  const user = req.user as User
  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to pay the request, user not found")
  }

  const pr = await walletService.payRequest({ payerId: user.id, payRequestId: id })
  res.send(pr)
})

const payWithdrawInvoice = catchAsync(async (req, res) => {
  const invoice = req.body.invoice
  const user = req.user as User
  if (!user.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Failed to pay the request, user not found")
  }

  const transaction = await walletService.payWithdrawInvoice(user.id, invoice)
  res.send(transaction)
})

export default {
  payUser,
  payRequest,
  payWithdrawInvoice,
  createPayRequests,
  createPayRequest,
  getPayRequest,
  getPayRequests,
  createDeposit,
  getDeposit,
}
