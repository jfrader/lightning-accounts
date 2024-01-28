import { Request } from "express"
import { userService } from "../../services"
import config from "../config"
import logger from "../logger"
import {
  Strategy as TwitterStrategy,
  StrategyOptions,
  Profile,
} from "@superfaceai/passport-twitter-oauth2"
import { User } from "@prisma/client"

const twitterOptions: StrategyOptions = {
  callbackURL: config.host + "/v1/auth/twitter/callback",
  clientID: config.twitter.clientID,
  clientSecret: config.twitter.clientSecret,
  clientType: config.twitter.clientType,
  scope: ["tweet.read", "users.read"],
  passReqToCallback: true as false,
}

const verify = async (
  req: Request,
  _accessToken: string,
  _refreshToken: string,
  profile: Profile,
  done: any
) => {
  try {
    const user = await userService.upsertTwitterUser(profile, req.user as User | null)

    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error: any) {
    logger.error(error)
    done(new Error(error?.message || "Failed to authenticate with twitter"), false)
  }
}

export const twitterStrategy = new TwitterStrategy(twitterOptions, verify as any)
