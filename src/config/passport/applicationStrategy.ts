import prisma from "../../client"
import { Strategy as JwtStrategy, ExtractJwt, VerifyCallback } from "passport-jwt"
import config from "../config"
import { TokenType } from "@prisma/client"

export const APPLICATION_STRATEGY_HEADER = "Lightning-Application-Token"

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: ExtractJwt.fromHeader(APPLICATION_STRATEGY_HEADER),
}

const jwtVerify: VerifyCallback = async (payload, done) => {
  try {
    if (payload.type !== TokenType.APPLICATION) {
      throw new Error("Invalid token type")
    }
    const user = await prisma.user.findUnique({
      select: {
        id: true,
        email: true,
        name: true,
      },
      where: { id: payload.sub },
    })
    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error) {
    done(error, false)
  }
}

export const applicationStrategy = new JwtStrategy(jwtOptions, jwtVerify)
