import httpStatus from "http-status"
import catchAsync from "../utils/catchAsync"
import { authService, userService, tokenService, emailService } from "../services"
import exclude from "../utils/exclude"
import { User } from "@prisma/client"
import authCookie, { cookieExtractor } from "../utils/authCookie"
import { JwtCookie } from "../types/tokens"

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

const logout = catchAsync(async (req, res) => {
  const token = cookieExtractor(req, JwtCookie.refresh)
  await authService.logout(token)
  res.clearCookie(JwtCookie.access)
  res.clearCookie(JwtCookie.refresh)
  res.status(httpStatus.NO_CONTENT).send()
})

const refreshTokens = catchAsync(async (req, res) => {
  const token = cookieExtractor(req, JwtCookie.refresh)
  try {
    const tokens = await authService.refreshAuth(token)
    authCookie(tokens, res).status(httpStatus.NO_CONTENT).send()
  } catch (e) {
    res.clearCookie(JwtCookie.refresh)
    throw e
  }
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
  res.send(userWithWallet)
})

export default {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  getMe,
}
