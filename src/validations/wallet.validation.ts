import Joi from "joi"

const positiveSats = Joi.number().integer().min(1).max(2_147_483_647)
const positiveId = Joi.number().integer().min(1)
const description = Joi.string().max(500)

const createPayRequest = {
  body: Joi.object().keys({
    amountInSats: positiveSats.required(),
    receiverId: positiveId.required(),
    description,
    meta: Joi.object(),
  }),
}

const createPayRequests = {
  body: Joi.object().keys({
    amountInSats: positiveSats.required(),
    receiverIds: Joi.array().items(positiveId).min(1).max(1000).unique().required(),
    description,
    meta: Joi.object(),
  }),
}

const createDeposit = {
  body: Joi.object().keys({
    amountInSats: positiveSats.required(),
  }),
}

const getPayRequests = {
  body: Joi.object().keys({
    payRequestIds: Joi.array().items(positiveId).min(1).max(1000).unique().required(),
  }),
}

const getDeposit = {
  params: Joi.object().keys({
    transactionId: positiveId.required(),
  }),
}

const getPayRequest = {
  params: Joi.object().keys({
    payRequestId: positiveId.required(),
  }),
}

const payRequest = {
  params: Joi.object().keys({
    payRequestId: positiveId.required(),
  }),
}

const payUser = {
  body: Joi.object().keys({
    amountInSats: positiveSats.required(),
    userId: positiveId.required(),
    description,
  }),
}

const withdraw = {
  body: Joi.object().keys({
    invoice: Joi.string().max(10_000).required(),
  }),
}

export default {
  payUser,
  payRequest,
  getPayRequest,
  getPayRequests,
  createPayRequest,
  createPayRequests,
  createDeposit,
  getDeposit,
  withdraw,
}
