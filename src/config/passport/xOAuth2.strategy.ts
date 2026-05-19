import axios from "axios"
import OAuth2Strategy from "passport-oauth2"

export const X_OAUTH2_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize"
export const X_OAUTH2_TOKEN_URL = "https://api.x.com/2/oauth2/token"
export const X_USER_PROFILE_URL = "https://api.x.com/2/users/me?user.fields=profile_image_url,url"
export const X_USER_PROFILE_FALLBACK_URLS = [
  "https://api.x.com/2/users/me",
  "https://api.twitter.com/2/users/me?user.fields=profile_image_url,url",
  "https://api.twitter.com/2/users/me",
]

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
  errors?: Array<{
    message?: string
    detail?: string
    title?: string
    code?: string | number
    status?: number
  }>
  detail?: string
  error_description?: string
  title?: string
  client_id?: string
  reason?: string
  registration_url?: string
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

const getXProfileErrorMessage = (error: any) => {
  const data = error?.response?.data
  const status = error?.response?.status
  const message =
    data?.errors?.[0]?.message ??
    data?.errors?.[0]?.detail ??
    data?.errors?.[0]?.title ??
    data?.error_description ??
    data?.detail ??
    data?.title ??
    error?.message ??
    "Failed to fetch X profile"
  const metadata = [
    data?.client_id ? `client_id=${data.client_id}` : null,
    data?.reason ? `reason=${data.reason}` : null,
    data?.registration_url ? `registration_url=${data.registration_url}` : null,
  ].filter(Boolean)
  const suffix = metadata.length ? ` (${metadata.join(", ")})` : ""

  return status ? `X profile request failed with ${status}: ${message}${suffix}` : message
}

export class XOAuth2Strategy extends OAuth2Strategy {
  private readonly userProfileURL: string
  private readonly userProfileFallbackURLs: string[]

  constructor(
    options: XOAuth2StrategyOptions,
    verify: OAuth2Strategy.VerifyFunctionWithRequest<XProfile>
  ) {
    super(buildXOAuth2StrategyOptions(options), verify)
    this.name = "twitter"
    this.userProfileURL = options.userProfileURL ?? X_USER_PROFILE_URL
    this.userProfileFallbackURLs = options.userProfileURL ? [] : X_USER_PROFILE_FALLBACK_URLS
  }

  async userProfile(accessToken: string, done: (error?: unknown, profile?: XProfile) => void) {
    let lastError: unknown

    try {
      const profileURLs = [this.userProfileURL, ...this.userProfileFallbackURLs]

      for (const profileURL of profileURLs) {
        try {
          const response = await axios.get<XUserInfoResponse>(profileURL, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (!response.data.data) {
            throw new Error(response.data.errors?.[0]?.message ?? "Failed to fetch valid X profile")
          }

          const profile = mapXProfile(response.data.data)
          return done(null, { ...profile, _raw: JSON.stringify(response.data) })
        } catch (error: any) {
          lastError = error

          if (![401, 403].includes(error?.response?.status)) {
            throw error
          }
        }
      }

      throw lastError
    } catch (error: any) {
      done(new OAuth2Strategy.InternalOAuthError(getXProfileErrorMessage(error), error))
    }
  }
}
