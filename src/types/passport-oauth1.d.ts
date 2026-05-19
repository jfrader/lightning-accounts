declare module "passport-oauth1" {
  import { Request } from "express"
  import { OutgoingHttpHeaders } from "http"
  import { Strategy } from "passport"

  class OAuth1Strategy extends Strategy {
    constructor(options: OAuth1Strategy.StrategyOptions, verify: OAuth1Strategy.VerifyFunction)
    constructor(
      options: OAuth1Strategy.StrategyOptionsWithRequest,
      verify: OAuth1Strategy.VerifyFunctionWithRequest
    )

    authenticate(req: Request, options?: unknown): void
  }

  namespace OAuth1Strategy {
    type VerifyCallback = (err?: Error | null | unknown, user?: Express.User | false) => void

    type VerifyFunction = (
      token: string,
      tokenSecret: string,
      params: Record<string, string | undefined>,
      profile: unknown,
      done: VerifyCallback
    ) => void

    type VerifyFunctionWithRequest = (
      req: Request,
      token: string,
      tokenSecret: string,
      params: Record<string, string | undefined>,
      profile: unknown,
      done: VerifyCallback
    ) => void

    interface StrategyOptions {
      requestTokenURL: string
      accessTokenURL: string
      userAuthorizationURL: string
      consumerKey: string
      consumerSecret: string
      callbackURL?: string
      customHeaders?: OutgoingHttpHeaders
      sessionKey?: string
      signatureMethod?: string
      skipUserProfile?: boolean
      passReqToCallback?: false
    }

    interface StrategyOptionsWithRequest extends Omit<StrategyOptions, "passReqToCallback"> {
      passReqToCallback: true
    }
  }

  export = OAuth1Strategy
}
