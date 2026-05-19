import OAuth1Strategy from "passport-oauth1"
import { Request } from "express"
import { User } from "@prisma/client"
import { userService } from "../../services"
import { SessionUser } from "../../types/user"
import config from "../config"
import logger from "../logger"
import { XProfile } from "./xOAuth2.strategy"

export const X_OAUTH1_REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token"
export const X_OAUTH1_ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token"
export const X_OAUTH1_AUTHENTICATE_URL = "https://api.x.com/oauth/authenticate"

export const mapTwitterOAuth1Profile = (params: Record<string, string | undefined>): XProfile => ({
  provider: "twitter",
  id: params.user_id ?? "",
  username: params.screen_name,
  displayName: params.screen_name,
  name: { givenName: params.screen_name },
  photos: [],
  _raw: JSON.stringify(params),
})

const twitterOptions: OAuth1Strategy.StrategyOptionsWithRequest = {
  requestTokenURL: X_OAUTH1_REQUEST_TOKEN_URL,
  accessTokenURL: X_OAUTH1_ACCESS_TOKEN_URL,
  userAuthorizationURL: X_OAUTH1_AUTHENTICATE_URL,
  consumerKey: config.twitter.apiKey ?? "missing-x-api-key",
  consumerSecret: config.twitter.apiSecret ?? "",
  callbackURL: config.host + "/v1/auth/twitter/callback",
  sessionKey: "oauth:twitter",
  skipUserProfile: true,
  passReqToCallback: true,
}

const verify = async (
  req: Request,
  _token: string,
  _tokenSecret: string,
  params: Record<string, string | undefined>,
  _profile: unknown,
  done: (err: unknown, user: SessionUser | false) => void
) => {
  try {
    const profile = mapTwitterOAuth1Profile(params)

    if (!profile.id) {
      return done(new Error("Failed to authenticate with Twitter: missing user_id"), false)
    }

    const user = await userService.upsertTwitterUser(profile, req.user as User | null)

    if (!user) {
      return done(null, false)
    }
    done(null, user)
  } catch (error: any) {
    logger.error(error)
    done(new Error(error?.message || "Failed to authenticate with Twitter"), false)
  }
}

export const twitterStrategy = new OAuth1Strategy(twitterOptions, verify)
