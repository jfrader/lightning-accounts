import { Request } from "express"
import { User } from "@prisma/client"
import { userService } from "../../services"
import { SessionUser } from "../../types/user"
import config from "../config"
import logger from "../logger"
import { XOAuth2Strategy, XOAuth2StrategyOptions, XProfile } from "./xOAuth2.strategy"

const xOptions: XOAuth2StrategyOptions = {
  callbackURL: config.host + "/v1/auth/x/callback",
  clientID: config.twitter.clientID ?? "missing-x-client-id",
  clientSecret: config.twitter.clientSecret ?? "",
  clientType: config.twitter.clientType,
  scope: ["tweet.read", "users.read", "offline.access"],
  passReqToCallback: true,
}

const verify = async (
  req: Request,
  _accessToken: string,
  _refreshToken: string,
  profile: XProfile,
  done: (err: unknown, user: SessionUser | false) => void
) => {
  try {
    const user = await userService.upsertTwitterUser(profile, req.user as User | null)

    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error: any) {
    logger.error(error)
    done(new Error(error?.message || "Failed to authenticate with X"), false)
  }
}

export const xStrategy = new XOAuth2Strategy(xOptions, verify)
