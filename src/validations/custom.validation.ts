import Joi from "joi"

export const password = Joi.extend((joi) => {
  return {
    type: "password",
    base: joi.string(),
    messages: {
      "password.length": "password must be at least 8 characters",
      "password.difficulty": "password must contain at least 1 letter and 1 number",
    },
    validate(value, helpers) {
      if (value.length < 8) {
        return { value, errors: helpers.error("password.length") }
      }
      if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
        return { value, errors: helpers.error("password.difficulty") }
      }
      return { value }
    },
  }
})
