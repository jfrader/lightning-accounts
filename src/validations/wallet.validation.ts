import Joi from "joi"

const createDeposit = {
  body: Joi.object().keys({
    amountInSats: Joi.number().required(),
  }),
}

const getDeposit = {
  params: Joi.object().keys({
    transactionId: Joi.number().required(),
  }),
}

export default {
  createDeposit,
  getDeposit,
}
