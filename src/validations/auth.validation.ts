// src/validations/auth.validation.ts
import Joi from "joi"
import { password } from "./custom.validation"

// Custom validation for seed phrase (5 words)
const seedPhrase = Joi.string()
  .required()
  .pattern(/^\w+\s+\w+\s+\w+\s+\w+\s+\w+$/)
  .message("Seed phrase must consist of exactly 5 words separated by spaces")

const register = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().required().email(),
    password: password.password(),
  }),
}

const login = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required(),
  }),
}

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
}

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required(),
  }),
}

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
  body: Joi.object().keys({
    password: password.password(),
  }),
}

const verifyEmail = {
  query: Joi.object().keys({
    token: Joi.string().required(),
  }),
}

const registerWithSeed = {
  body: Joi.object().keys({
    name: Joi.string().required().max(16),
  }),
}

const loginWithSeed = {
  body: Joi.object().keys({
    seedPhrase,
  }),
}

export default {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  registerWithSeed,
  loginWithSeed,
}
