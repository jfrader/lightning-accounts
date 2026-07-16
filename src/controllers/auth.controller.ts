import httpStatus from "http-status"
import catchAsync from "../utils/catchAsync"
import { authService, userService, tokenService, emailService } from "../services"
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
  const userWithoutPassword = authService.serializeAuthUser(user)
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).status(httpStatus.CREATED).send({ user: userWithoutPassword })
})

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body
  const passwordUser = await authService.findMagicLinkUser(email)
  if (!passwordUser || !passwordUser.password) {
    if (passwordUser && passwordUser.role !== "APPLICATION") {
      const magicLinkToken = await tokenService.generateMagicLinkToken(passwordUser)
      await emailService.sendMagicLinkEmail(email, magicLinkToken, "profile")
    }
    res.status(httpStatus.ACCEPTED).send({ magicLinkSent: true })
    return
  }
  const user = await authService.loginUserWithEmailAndPassword(email, password)
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user })
})

const registerWithMagicLink = catchAsync(async (req, res) => {
  const { email, name } = req.body
  const user = await authService.registerUserWithMagicLink(email, name)
  if (config.env === "test" || user.role !== "APPLICATION") {
    const magicLinkToken = await tokenService.generateMagicLinkToken(user)
    await emailService.sendMagicLinkEmail(email, magicLinkToken)
  }
  res.status(httpStatus.NO_CONTENT).send()
})

const loginWithMagicLink = catchAsync(async (req, res) => {
  const { email, next } = req.body
  const user = await authService.getOrCreateMagicLinkUser(email)
  if (user.role !== "APPLICATION") {
    const magicLinkToken = await tokenService.generateMagicLinkToken(user)
    await emailService.sendMagicLinkEmail(email, magicLinkToken, next)
  }
  res.status(httpStatus.NO_CONTENT).send()
})

const consumeMagicLink = catchAsync(async (req, res) => {
  const user = await authService.consumeMagicLink(req.query.token as string)
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user })
})

const registerWithSeed = catchAsync(async (req, res) => {
  const { name } = req.body
  const { user, seedPhrase } = await userService.createUserWithSeed(name)
  res.status(httpStatus.CREATED).send({ user, seedPhrase })
})

const loginWithSeed = catchAsync(async (req, res) => {
  const user = req.user as User
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user: authService.serializeAuthUser(user) })
})

const loginWithNostr = catchAsync(async (req, res) => {
  const user = req.user as User
  const tokens = await tokenService.generateAuthTokens(user)
  authCookie(tokens, res).send({ user: authService.serializeAuthUser(user) })
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
  if (token) {
    try {
      await authService.logout(token)
    } catch {
      logger.warn("Unable to revoke refresh token during logout")
    }
  }
  res.status(httpStatus.NO_CONTENT).send()
})

const refreshTokens = catchAsync(async (req, res) => {
  const token = cookieExtractor(req, getCookieName(JwtCookie.refresh))

  if (!token) {
    res.status(httpStatus.BAD_REQUEST).send()
    return
  }

  const tokens = await authService.refreshAuth(token)
  req.session.touch()
  authCookie(tokens, res).status(httpStatus.NO_CONTENT).send()
})

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email)
  if (resetPasswordToken) {
    emailService
      .sendResetPasswordEmail(req.body.email, resetPasswordToken)
      .then(() => logger.info("Sent reset password email to " + req.body.email))
      .catch(() => logger.warn("Tried to reset password on non existent email " + req.body.email))
  }
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
  const userWithWallet = await userService.getUserWithWallet(user.id, [
    "id",
    "email",
    "twitter",
    "isEmailVerified",
    "createdAt",
    "updatedAt",
    "hasSeed",
    "nostrPubkey",
    "name",
    "role",
    "avatarUrl",
    "password",
  ])
  const tokens = await tokenService.generateIdentityToken(user)
  authCookieResponse(tokens, res).send(
    userWithWallet ? authService.serializeAuthUser(userWithWallet) : userWithWallet
  )
})

const addSeed = catchAsync(async (req, res) => {
  const user = req.user as User
  const { user: updatedUser, seedPhrase } = await userService.addSeedToUser(user.id)
  const tokens = await tokenService.generateAuthTokens(updatedUser)
  authCookieResponse(tokens, res).status(httpStatus.OK).send({ user: updatedUser, seedPhrase })
})

export default {
  register,
  login,
  registerWithMagicLink,
  loginWithMagicLink,
  consumeMagicLink,
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
  loginWithNostr,
  addSeed,
}
