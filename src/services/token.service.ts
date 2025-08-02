import jwt from "jsonwebtoken"
import moment, { Moment } from "moment"
import config from "../config/config"
import userService from "./user.service"
import { Token, TokenType } from "@prisma/client"
import prisma from "../client"
import { AuthTokensResponse } from "../types/response"

/**
 * Generate token
 * @param {number} userId
 * @param {Moment} expires
 * @param {string} type
 * @param {string} [secret]
 * @returns {string}
 */
const generateToken = (
  userId: number,
  expires: Moment,
  type: TokenType,
  secret = config.jwt.privateKey
): string => {
  const payload = {
    sub: userId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
  }
  return jwt.sign(payload, secret, { algorithm: "RS256" })
}

/**
 * Save a token
 * @param {string} token
 * @param {number} userId
 * @param {Moment} expires
 * @param {string} type
 * @param {boolean} [blacklisted]
 * @returns {Promise<Token>}
 */
const saveToken = async (
  token: string,
  userId: number,
  expires: Moment,
  type: TokenType,
  blacklisted = false
): Promise<Token> => {
  const createdToken = await prisma.token.create({
    data: {
      token,
      userId: userId,
      expires: expires.toDate(),
      type,
      blacklisted,
    },
  })

  return createdToken
}

/**
 * Verify token and return token doc (or throw an error if it is not valid)
 * @param {string} token
 * @param {string} type
 * @returns {Promise<Token>}
 */
const verifyToken = async (token: string, type: TokenType): Promise<Token> => {
  const payload = jwt.verify(token, config.jwt.publicKey, { algorithms: ["RS256"] })
  const userId = Number(payload.sub)
  const tokenData = await prisma.token.findFirst({
    where: { token, type, userId, blacklisted: false },
  })
  if (!tokenData) {
    throw new Error("Token not found")
  }
  return tokenData
}

/**
 * Generate auth tokens
 * @param {User} user
 * @returns {Promise<AuthTokensResponse>}
 */
const generateAuthTokens = async (user: { id: number }): Promise<AuthTokensResponse> => {
  const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, "minutes")
  const accessToken = generateToken(user.id, accessTokenExpires, TokenType.ACCESS)

  const refreshTokenExpires = moment().add(config.jwt.refreshExpirationDays, "days")
  const refreshToken = generateToken(user.id, refreshTokenExpires, TokenType.REFRESH)
  await saveToken(refreshToken, user.id, refreshTokenExpires, TokenType.REFRESH)

  const identityToken = generateToken(user.id, accessTokenExpires, TokenType.IDENTITY)

  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires.toDate(),
    },
    refresh: {
      token: refreshToken,
      expires: refreshTokenExpires.toDate(),
    },
    identity: {
      token: identityToken,
      expires: accessTokenExpires.toDate(),
    },
  }
}

const generateIdentityToken = async (user: {
  id: number
}): Promise<Pick<AuthTokensResponse, "identity">> => {
  const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, "minutes")
  const identityToken = generateToken(user.id, accessTokenExpires, TokenType.IDENTITY)

  return {
    identity: {
      token: identityToken,
      expires: accessTokenExpires.toDate(),
    },
  }
}

/**
 * Generate reset password token
 * @param {string} email
 * @returns {Promise<string>}
 */
const generateResetPasswordToken = async (email: string): Promise<string> => {
  const user = await userService.getUserByEmail(email)
  if (!user) {
    return ""
  }
  const expires = moment().add(config.jwt.resetPasswordExpirationMinutes, "minutes")
  const resetPasswordToken = generateToken(user.id, expires, TokenType.RESET_PASSWORD)
  await saveToken(resetPasswordToken, user.id as number, expires, TokenType.RESET_PASSWORD)
  return resetPasswordToken
}

/**
 * Generate verify email token
 * @param {User} user
 * @returns {Promise<string>}
 */
const generateVerifyEmailToken = async (user: { id: number }): Promise<string> => {
  const expires = moment().add(config.jwt.verifyEmailExpirationMinutes, "minutes")
  const verifyEmailToken = generateToken(user.id, expires, TokenType.VERIFY_EMAIL)
  await saveToken(verifyEmailToken, user.id, expires, TokenType.VERIFY_EMAIL)
  return verifyEmailToken
}

export default {
  generateToken,
  saveToken,
  verifyToken,
  generateAuthTokens,
  generateIdentityToken,
  generateResetPasswordToken,
  generateVerifyEmailToken,
}
