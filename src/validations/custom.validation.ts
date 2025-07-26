import Joi from "joi"

export const password = Joi.extend((joi) => {
  return {
    type: "password",
    base: joi.string(),
    messages: {
      "password.length": "password must be at least 8 characters",
    },
    validate(value, helpers) {
      if (value.length < 8) {
        return { value, errors: helpers.error("password.length") }
      }
      return { value }
    },
  }
})
