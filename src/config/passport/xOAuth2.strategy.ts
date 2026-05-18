import axios from "axios"
import OAuth2Strategy from "passport-oauth2"

export const X_OAUTH2_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
export const X_OAUTH2_TOKEN_URL = "https://api.x.com/2/oauth2/token"
export const X_USER_PROFILE_URL = "https://api.x.com/2/users/me?user.fields=profile_image_url,url"

export type XClientType = "confidential" | "private" | "public" | string | undefined

export interface XProfile {
  provider: "twitter"
  id: string
  username?: string
  displayName?: string
  name?: {
    givenName?: string
  }
  profileUrl?: string
  photos?: Array<{ value: string }>
  _raw?: string
  _json?: XUser
}

interface XUser {
  id: string
  username?: string
  name?: string
  profile_image_url?: string
  url?: string
}

interface XUserInfoResponse {
  data?: XUser
  errors?: Array<{ message?: string; code?: string | number }>
}

export interface XOAuth2StrategyOptions extends Omit<
  OAuth2Strategy.StrategyOptionsWithRequest,
  "authorizationURL" | "tokenURL"
> {
  clientType?: XClientType
  userProfileURL?: string
}

export const mapXProfile = (user: XUser): XProfile => ({
  provider: "twitter",
  id: user.id,
  username: user.username,
  displayName: user.name,
  name: { givenName: user.name },
  profileUrl: user.url,
  photos: user.profile_image_url ? [{ value: user.profile_image_url }] : [],
  _json: user,
})

export const buildXOAuth2StrategyOptions = (
  userOptions: XOAuth2StrategyOptions
): OAuth2Strategy.StrategyOptionsWithRequest => {
  const options = {
    ...userOptions,
    authorizationURL: X_OAUTH2_AUTHORIZE_URL,
    tokenURL: X_OAUTH2_TOKEN_URL,
    clientSecret: userOptions.clientSecret ?? "",
    sessionKey: userOptions.sessionKey ?? "oauth:x",
    pkce: true,
    state: true,
  }

  if (userOptions.clientType === "confidential" || userOptions.clientType === "private") {
    options.customHeaders = {
      Authorization:
        "Basic " +
        Buffer.from(`${userOptions.clientID}:${userOptions.clientSecret ?? ""}`).toString("base64"),
      ...(userOptions.customHeaders ?? {}),
    }
  }

  return options
}

export class XOAuth2Strategy extends OAuth2Strategy {
  private readonly userProfileURL: string

  constructor(
    options: XOAuth2StrategyOptions,
    verify: OAuth2Strategy.VerifyFunctionWithRequest<XProfile>
  ) {
    super(buildXOAuth2StrategyOptions(options), verify)
    this.name = "twitter"
    this.userProfileURL = options.userProfileURL ?? X_USER_PROFILE_URL
  }

  async userProfile(accessToken: string, done: (error?: unknown, profile?: XProfile) => void) {
    try {
      const response = await axios.get<XUserInfoResponse>(this.userProfileURL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.data.data) {
        const message = response.data.errors?.[0]?.message ?? "Failed to fetch valid X profile"
        return done(new Error(message))
      }

      const profile = mapXProfile(response.data.data)
      done(null, { ...profile, _raw: JSON.stringify(response.data) })
    } catch (error: any) {
      const message =
        error?.response?.data?.errors?.[0]?.message ??
        error?.response?.data?.error_description ??
        error?.message ??
        "Failed to fetch X profile"
      done(new OAuth2Strategy.InternalOAuthError(message, error))
    }
  }
}
