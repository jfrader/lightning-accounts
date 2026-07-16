import Joi from "joi"

const feedback = {
  body: Joi.object().keys({
    message: Joi.string().trim().min(1).max(1000).required(),
    context: Joi.string().valid("lobby", "match").required(),
    matchSessionId: Joi.string().trim().max(100).allow("", null),
    author: Joi.object()
      .keys({
        name: Joi.string().trim().min(1).max(32).required(),
        session: Joi.string().trim().min(1).max(100).required(),
        accountId: Joi.number().integer().positive().allow(null),
        accountEmail: Joi.string().email().max(320).allow("", null),
      })
      .required(),
  }),
}

export default { feedback }
