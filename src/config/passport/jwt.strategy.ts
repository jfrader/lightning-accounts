import prisma from "../../client"
import { Strategy as JwtStrategy, VerifyCallback } from "passport-jwt"
import config from "../config"
import { TokenType } from "@prisma/client"
import { cookieExtractor } from "../../utils/authCookie"
import logger from "../logger"
import { SessionUser } from "../../types/user"

const jwtOptions = {
  secretOrKey: config.jwt.publicKey,
  jwtFromRequest: cookieExtractor,
}

const jwtVerify: VerifyCallback = async (
  payload,
  done: (err: unknown, user: SessionUser | false) => void
) => {
  try {
    if (payload.type !== TokenType.ACCESS) {
      throw new Error("Invalid token type")
    }
    const user = await prisma.user.findUnique({
      select: {
        id: true,
        email: true,
        twitter: true,
        name: true,
        role: true,
        avatarUrl: true,
        nostrPubkey: true,
      },
      where: { id: payload.sub },
    })
    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error) {
    logger.error(error)
    done(error, false)
  }
}

export const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify)
