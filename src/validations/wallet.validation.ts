import Joi from "joi"

const createPayRequest = {
  body: Joi.object().keys({
    amountInSats: Joi.number().required(),
    receiverId: Joi.number().required(),
    description: Joi.string(),
    meta: Joi.object(),
  }),
}

const createPayRequests = {
  body: Joi.object().keys({
    amountInSats: Joi.number().required(),
    receiverIds: Joi.array().items(Joi.number()).required(),
    description: Joi.string(),
    meta: Joi.object(),
  }),
}

const createDeposit = {
  body: Joi.object().keys({
    amountInSats: Joi.number().required(),
  }),
}

const getPayRequests = {
  body: Joi.object().keys({
    payRequestIds: Joi.array().items(Joi.number()),
  }),
}

const getDeposit = {
  params: Joi.object().keys({
    transactionId: Joi.number().required(),
  }),
}

const getPayRequest = {
  params: Joi.object().keys({
    payRequestId: Joi.number().required(),
  }),
}

const payRequest = {
  params: Joi.object().keys({
    payRequestId: Joi.number().required(),
  }),
}

const payUser = {
  body: Joi.object().keys({
    amountInSats: Joi.number().required(),
    userId: Joi.number().required(),
    description: Joi.string(),
  }),
}

const withdraw = {
  body: Joi.object().keys({
    invoice: Joi.string().required(),
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
