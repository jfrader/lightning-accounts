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
  ])

  if (!user) {
    logger.error("User not found", { email })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  if (config.env !== "test" && user.role === Role.APPLICATION) {
    logger.error("Application user attempted email login", { email })
    throw new ApiError(httpStatus.BAD_REQUEST, "Applications can't use email and password login")
  }

  logger.debug("Comparing password", { email, passwordLength: password.length })
  const isMatch = await isPasswordMatch(password, user.password as string)
  if (!isMatch) {
    logger.error("Password mismatch", {
      email,
      passwordLength: password.length,
      storedHash: user.password,
    })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Incorrect email or password")
  }

  logger.info("Login successful", { email })
  return exclude(user, ["password"])
}

const loginUserWithSeedPhrase = async (
  seedPhrase: string
): Promise<Omit<User, "password" | "seedHash">> => {
  logger.info("Attempting seed phrase login", {})
  if (!seedPhrase || typeof seedPhrase !== "string") {
    logger.error("Invalid seed phrase", { seedPhraseLength: seedPhrase?.length || 0 })
    throw new ApiError(httpStatus.BAD_REQUEST, "Seed phrase is required")
  }

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
    logger.error("User not found or no seed hash", { seedPhraseLength: seedPhrase.length })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid seed phrase")
  }

  logger.debug("Comparing seed phrase", { userId: user.id, email: user.email })
  const isMatch = await isPasswordMatch(seedPhrase, user.seedHash)
  if (!isMatch) {
    logger.error("Seed phrase mismatch", { userId: user.id, email: user.email })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid seed phrase")
  }

  logger.info("Seed phrase login successful", { userId: user.id, email: user.email })
  return exclude(user, ["seedHash"])
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
    logger.error("Refresh token not found", { refreshToken })
    throw new ApiError(httpStatus.NOT_FOUND, "Not found")
  }
  await prisma.token.delete({ where: { id: refreshTokenData.id } })
  logger.info("Logout successful", { refreshToken })
}

const refreshAuth = async (refreshToken: string): Promise<AuthTokensResponse> => {
  try {
    logger.info("Attempting to refresh auth tokens", { refreshToken })
    logger.debug("Verifying refresh token", { refreshToken })
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
    logger.debug("Hashing new password", {
      userId: user.id,
      email: user.email,
      newPasswordLength: newPassword.length,
    })
    const encryptedPassword = await encryptPassword(newPassword)
    logger.debug("Updating user password", {
      userId: user.id,
      email: user.email,
      encryptedPassword,
    })

    await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { password: encryptedPassword },
        select: { id: true, email: true, name: true, role: true },
      })
      logger.debug("Password updated in transaction", {
        userId: updatedUser.id,
        email: updatedUser.email,
      })

      // Verify the update
      const verifiedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      })
      if (!verifiedUser || verifiedUser.password !== encryptedPassword) {
        logger.error("Password update verification failed", {
          userId: user.id,
          expectedHash: encryptedPassword,
          actualHash: verifiedUser?.password,
        })
        throw new Error("Password update did not persist")
      }
      logger.debug("Password update verified", { userId: user.id, password: verifiedUser.password })

      await tx.token.deleteMany({ where: { userId: user.id, type: TokenType.RESET_PASSWORD } })
      logger.debug("Reset tokens deleted", { userId: user.id })
    })
    logger.info("Password reset successful", { userId: user.id, email: user.email })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error("Password reset failed", { error: errorMessage, stack: errorStack })
    throw new ApiError(httpStatus.UNAUTHORIZED, "Password reset failed")
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
        select: { id: true, email: true, name: true, role: true },
      })
      logger.debug("Email verified in transaction", {
        userId: updatedUser.id,
        email: updatedUser.email,
      })

      // Verify the update
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
  loginUserWithSeedPhrase,
  isPasswordMatch,
  encryptPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
}
