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
import { getRecoveryPassword } from "../utils/string/getRandomWord"

const loginUserWithEmailAndPassword = async (
  email: string,
  password: string
): Promise<Omit<User, "password" | "seedHash">> => {
  logger.info("Attempting user login", { email })
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
    "hasSeed",
  ])

  if (!user) {
    logger.error("User not found", { email })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  if (config.env !== "test" && user.role === Role.APPLICATION) {
    logger.error("Application user attempted email login", { email })
    throw new ApiError(httpStatus.BAD_REQUEST, "Applications can't use email and password login")
  }

  const isMatch = await isPasswordMatch(password, user.password as string)
  if (!isMatch) {
    logger.error("Password mismatch")
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  logger.info("Login successful", { email })
  return exclude(user, ["password"])
}

const logout = async (refreshToken: string): Promise<void> => {
  logger.info("Attempting logout", { refreshToken })
  const refreshTokenData = await prisma.token.findFirst({
    where: {
      token: refreshToken,
      type: TokenType.REFRESH,
      blacklisted: false,
    },
  })
  if (!refreshTokenData) {
    logger.error("Refresh token not found")
    throw new ApiError(httpStatus.NOT_FOUND, "Not found")
  }
  await prisma.token.delete({ where: { id: refreshTokenData.id } })
  logger.info("Logout successful")
}

const refreshAuth = async (refreshToken: string): Promise<AuthTokensResponse> => {
  try {
    logger.info("Attempting to refresh auth tokens")
    logger.debug("Verifying refresh token")
    const refreshTokenData = await tokenService.verifyToken(refreshToken, TokenType.REFRESH)
    const { userId } = refreshTokenData
    logger.debug("Refresh token verified", { userId })
    await prisma.token.deleteMany({ where: { expires: { lte: new Date() }, userId } })
    logger.debug("Expired tokens deleted", { userId })
    const tokens = await tokenService.generateAuthTokens({ id: userId })
    logger.info("Auth tokens generated", { userId })
    return tokens
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error("Refresh auth failed", { error: errorMessage, stack: errorStack })
    throw new ApiError(httpStatus.FORBIDDEN, "Please authenticate")
  }
}

const resetPassword = async (resetPasswordToken: string, newPassword: string): Promise<void> => {
  try {
    logger.info("Attempting password reset", { resetPasswordToken })
    const resetPasswordTokenData = await tokenService.verifyToken(
      resetPasswordToken,
      TokenType.RESET_PASSWORD
    )
    logger.debug("Reset password token verified", { userId: resetPasswordTokenData.userId })
    const user = await userService.getUserById(resetPasswordTokenData.userId)
    if (!user) {
      logger.error("User not found for reset password", { userId: resetPasswordTokenData.userId })
      throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }
    logger.debug("Hashing new password")
    const encryptedPassword = await encryptPassword(newPassword)
    logger.debug("Updating user password")

    await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { password: encryptedPassword },
        select: { id: true, email: true, name: true, role: true, hasSeed: true },
      })
      logger.debug("Password updated in transaction", {
        userId: updatedUser.id,
        email: updatedUser.email,
      })

      const verifiedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      })
      if (!verifiedUser || verifiedUser.password !== encryptedPassword) {
        logger.error("Password update verification failed")
        throw new Error("Password update did not persist")
      }
      logger.debug("Password update verified", { userId: user.id })

      await tx.token.deleteMany({ where: { userId: user.id, type: TokenType.RESET_PASSWORD } })
      logger.debug("Reset tokens deleted")
    })
    logger.info("Password reset successful")
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error("Password reset failed", { error: errorMessage, stack: errorStack })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Password reset failed")
  }
}

const generateSeedPhrase = async (userId: number): Promise<string> => {
  try {
    logger.info("Attempting to generate seed phrase", { userId })
    const user = await userService.getUserById(userId)
    if (!user) {
      logger.error("User not found", { userId })
      throw new ApiError(httpStatus.NOT_FOUND, "User not found")
    }

    const seedPhrase = getRecoveryPassword(5, " ")
    logger.debug("Generated seed phrase")
    const encryptedSeed = await encryptPassword(seedPhrase)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { seedHash: encryptedSeed, hasSeed: true },
        select: { id: true, email: true, name: true, role: true, hasSeed: true },
      })

      logger.debug("Seed phrase updated in transaction")

      const verifiedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { seedHash: true, hasSeed: true },
      })
      if (!verifiedUser || verifiedUser.seedHash !== encryptedSeed || !verifiedUser.hasSeed) {
        logger.error("Seed phrase update verification failed")
        throw new Error("Seed phrase update did not persist")
      }
      logger.debug("Seed phrase update verified")
    })
    logger.info("Seed phrase generated and set successfully")
    return seedPhrase
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error("Seed phrase generation failed", { error: errorMessage, stack: errorStack })
    throw new ApiError(httpStatus.BAD_REQUEST, "Seed phrase generation failed")
  }
}

const verifyEmail = async (verifyEmailToken: string): Promise<void> => {
  try {
    logger.info("Attempting email verification", { verifyEmailToken })
    const verifyEmailTokenData = await tokenService.verifyToken(
      verifyEmailToken,
      TokenType.VERIFY_EMAIL
    )
    logger.debug("Email token verified", { userId: verifyEmailTokenData.userId })
    await prisma.$transaction(async (tx) => {
      await tx.token.deleteMany({
        where: { userId: verifyEmailTokenData.userId, type: TokenType.VERIFY_EMAIL },
      })
      logger.debug("Email verification tokens deleted", { userId: verifyEmailTokenData.userId })
      const updatedUser = await tx.user.update({
        where: { id: verifyEmailTokenData.userId },
        data: { isEmailVerified: true },
        select: { id: true, email: true, name: true, role: true, hasSeed: true },
      })
      logger.debug("Email verified in transaction", {
        userId: updatedUser.id,
        email: updatedUser.email,
      })

      const verifiedUser = await tx.user.findUnique({
        where: { id: verifyEmailTokenData.userId },
        select: { isEmailVerified: true },
      })
      if (!verifiedUser || !verifiedUser.isEmailVerified) {
        logger.error("Email verification update failed", { userId: verifyEmailTokenData.userId })
        throw new Error("Email verification update did not persist")
      }
      logger.debug("Email verification update verified", { userId: verifyEmailTokenData.userId })
    })
    logger.info("Email verification successful", { userId: verifyEmailTokenData.userId })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error("Email verification failed", { error: errorMessage, stack: errorStack })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Email verification failed")
  }
}

export default {
  loginUserWithEmailAndPassword,
  isPasswordMatch,
  encryptPassword,
  logout,
  refreshAuth,
  resetPassword,
  generateSeedPhrase,
  verifyEmail,
}
