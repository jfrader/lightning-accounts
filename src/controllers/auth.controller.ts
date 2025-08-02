import httpStatus from "http-status"
import catchAsync from "../utils/catchAsync"
import { authService, userService, tokenService, emailService } from "../services"
import exclude from "../utils/exclude"
import { User } from "@prisma/client"
import authCookie, {
  cookieExtractor,
  deauthCookieResponse,
  getCookieName,
} from "../utils/authCookie"
import { JwtCookie } from "../types/tokens"
import logger from "../config/logger"
import ApiError from "../utils/ApiError"
import authCookieResponse from "../utils/authCookie"
import config from "../config/config"

const register = catchAsync(async (req, res) => {
  const { email, password, name } = req.body
  const user = await userService.createUser(email, password, name)
  const userWithoutPassword = exclude(user, ["password", "createdAt", "updatedAt"])
  const tokens = await tokenService.generateAuthTokens(user)

  authCookie(tokens, res).status(httpStatus.CREATED).send({ user: userWithoutPassword })
})

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body
  const user = await authService.loginUserWithEmailAndPassword(email, password)
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user })
})

const registerWithSeed = catchAsync(async (req, res) => {
  const { name } = req.body
  const { user, seedPhrase } = await userService.createUserWithSeed(name)
  const tokens = await tokenService.generateAuthTokens(user)

  authCookie(tokens, res).status(httpStatus.CREATED).send({ user, seedPhrase })
})

const loginWithSeed = catchAsync(async (req, res) => {
  const user = req.user as User
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user: exclude(user, ["password", "seedHash"]) })
})

const loginTwitter = catchAsync(async (req, res) => {
  const user = req.user as User | void

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Please authenticate")
  }

  const tokens = await tokenService.generateAuthTokens(user)

  authCookie(tokens, res).redirect(config.origin)
})

const logout = catchAsync(async (req, res) => {
  const token = cookieExtractor(req, getCookieName(JwtCookie.refresh))
  deauthCookieResponse(res)
  req.user = undefined
  try {
    await authService.logout(token)
  } catch (e: any) {
    logger.error(e.message)
  }

  res.status(httpStatus.NO_CONTENT).send()
})

const refreshTokens = catchAsync(async (req, res) => {
  const token = cookieExtractor(req, getCookieName(JwtCookie.refresh))
  const tokens = await authService.refreshAuth(token)
  req.session.touch()
  authCookie(tokens, res).status(httpStatus.NO_CONTENT).send()
})

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email)
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken)
  res.status(httpStatus.NO_CONTENT).send()
})

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token as string, req.body.password)
  res.status(httpStatus.NO_CONTENT).send()
})

const sendVerificationEmail = catchAsync(async (req, res) => {
  const user = req.user as User

  if (!user.email) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User doesn't have an email setup")
  }

  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user)

  await emailService.sendVerificationEmail(user.email, verifyEmailToken)
  res.status(httpStatus.NO_CONTENT).send()
})

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token as string)
  res.status(httpStatus.NO_CONTENT).send()
})

const getMe = catchAsync(async (req, res) => {
  const user = req.user as User
  const userWithWallet = await userService.getUserWithWallet(user.id)
  const tokens = await tokenService.generateIdentityToken(user)
  authCookieResponse(tokens, res).send(userWithWallet)
})

export default {
  register,
  login,
  loginTwitter,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  getMe,
  registerWithSeed,
  loginWithSeed,
}
