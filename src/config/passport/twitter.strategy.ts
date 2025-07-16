import { Request } from "express"
import { userService } from "../../services"
import config from "../config"
import logger from "../logger"
import {
  Strategy as TwitterStrategy,
  Profile,
  StrategyOptionsWithRequest,
} from "@superfaceai/passport-twitter-oauth2"
import { User } from "@prisma/client"
import { SessionUser } from "../../types/user"

const twitterOptions: StrategyOptionsWithRequest = {
  callbackURL: config.host + "/v1/auth/twitter/callback",
  clientID: config.twitter.clientID,
  clientSecret: config.twitter.clientSecret,
  clientType: config.twitter.clientType,
  scope: ["tweet.read", "users.read", "offline.access"],
  passReqToCallback: true,
}

const verify = async (
  req: Request,
  _accessToken: string,
  _refreshToken: string,
  profile: Profile,
  done: (err: unknown, user: SessionUser | false) => void
) => {
  try {
    logger.debug("Before upsert", { profile, requser: req.user })
    const user = await userService.upsertTwitterUser(profile, req.user as User | null)
    logger.debug("After upsert", { user })

    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error: any) {
    logger.error("Twitter verify error", error)
    done(new Error(error?.message || "Failed to authenticate with twitter"), false)
  }
}

export const twitterStrategy = new TwitterStrategy(twitterOptions, verify)
