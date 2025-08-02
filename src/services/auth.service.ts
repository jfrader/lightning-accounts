import httpStatus from "http-status"
import tokenService from "./token.service"
import userService from "./user.service"
import ApiError from "../utils/ApiError"
import { Role, TokenType, User } from "@prisma/client"
import prisma from "../client"
import { encryptPassword, isPasswordMatch } from "../utils/encryption"
import { AuthTokensResponse } from "../types/response"
import exclude from "../utils/exclude"
import logger from "../config/logger"
import config from "../config/config"

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Omit<User, 'password'>>}
 */
const loginUserWithEmailAndPassword = async (
  email: string,
  password: string
): Promise<Omit<User, "password" | "seedHash">> => {
  const user = await userService.getUserByEmail(email, [
    "id",
    "email",
    "name",
    "password",
    "role",
    "isEmailVerified",
    "createdAt",
    "updatedAt",
    "twitter",
    "twitterId",
    "avatarUrl",
    "nostrPubkey",
  ])

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  if (config.env !== "test" && user.role === Role.APPLICATION) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Applications can't use email and password login")
  }

  if (!(await isPasswordMatch(password, user.password as string))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  return exclude(user, ["password"])
}

/**
 * Login with seed phrase
 * @param {string} seedPhrase
 * @returns {Promise<Omit<User, 'password' | 'seedHash'>>}
 */
const loginUserWithSeedPhrase = async (
  seedPhrase: string
): Promise<Omit<User, "password" | "seedHash">> => {
  const user = await prisma.user.findFirst({
    where: { seedHash: { not: null } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
      twitter: true,
      twitterId: true,
      nostrPubkey: true,
      avatarUrl: true,
      seedHash: true,
    },
  })

  if (!user || !user.seedHash) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid seed phrase")
  }

  const isMatch = await isPasswordMatch(seedPhrase, user.seedHash)
  if (!isMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid seed phrase")
  }

  return exclude(user, ["seedHash"])
}

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
const logout = async (refreshToken: string): Promise<void> => {
  const refreshTokenData = await prisma.token.findFirst({
    where: {
      token: refreshToken,
      type: TokenType.REFRESH,
      blacklisted: false,
    },
  })
  if (!refreshTokenData) {
    throw new ApiError(httpStatus.NOT_FOUND, "Not found")
  }
  await prisma.token.delete({ where: { id: refreshTokenData.id } })
}

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<AuthTokensResponse>}
 */
const refreshAuth = async (refreshToken: string): Promise<AuthTokensResponse> => {
  try {
    const refreshTokenData = await tokenService.verifyToken(refreshToken, TokenType.REFRESH)
    const { userId } = refreshTokenData
    await prisma.token.deleteMany({ where: { expires: { lte: new Date() }, userId } })
    return await tokenService.generateAuthTokens({ id: userId })
  } catch (error) {
    logger.error("Refresh Auth Error", error)
    console.error(error)
    console.log(error)
    throw new ApiError(httpStatus.FORBIDDEN, "Please authenticate")
  }
}

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
const resetPassword = async (resetPasswordToken: string, newPassword: string): Promise<void> => {
  try {
    const resetPasswordTokenData = await tokenService.verifyToken(
      resetPasswordToken,
      TokenType.RESET_PASSWORD
    )
    const user = await userService.getUserById(resetPasswordTokenData.userId)
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }
    const encryptedPassword = await encryptPassword(newPassword)
    await userService.updateUserById(
      user.id,
      { password: encryptedPassword },
      ["id", "email", "name", "role"],
      false
    )
    await prisma.token.deleteMany({ where: { userId: user.id, type: TokenType.RESET_PASSWORD } })
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Password reset failed")
  }
}

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise<void>}
 */
const verifyEmail = async (verifyEmailToken: string): Promise<void> => {
  try {
    const verifyEmailTokenData = await tokenService.verifyToken(
      verifyEmailToken,
      TokenType.VERIFY_EMAIL
    )
    await prisma.token.deleteMany({
      where: { userId: verifyEmailTokenData.userId, type: TokenType.VERIFY_EMAIL },
    })
    await userService.updateUserById(
      verifyEmailTokenData.userId,
      { isEmailVerified: true },
      ["id", "email", "name", "role"],
      false
    )
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Email verification failed")
  }
}

export default {
  loginUserWithEmailAndPassword,
  loginUserWithSeedPhrase,
  isPasswordMatch,
  encryptPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
}
