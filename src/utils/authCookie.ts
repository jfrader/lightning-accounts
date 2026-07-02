import { Response, Request } from "express"
import { AuthTokensResponse } from "../types/response"
import config from "../config/config"
import { JwtCookie, SessionCookie } from "../types/tokens"

const secure = config.env === "production"
const cookieDomain = secure && config.domain ? config.domain : undefined

export function getCookieName(name: string) {
  return config.jwt.prefix + name
}

const authCookieResponse = ({ access, refresh, identity }: AuthTokensResponse, res: Response) => {
  if (access) {
    res.cookie(getCookieName(JwtCookie.access), access.token, {
      httpOnly: true,
      expires: access?.expires,
      domain: cookieDomain,
      sameSite: secure ? "none" : "lax",
      signed: secure,
      secure,
    })
  }

  if (refresh) {
    res.cookie(getCookieName(JwtCookie.refresh), refresh.token, {
      httpOnly: true,
      expires: refresh?.expires,
      domain: cookieDomain,
      sameSite: secure ? "none" : "lax",
      signed: secure,
      secure,
    })
  }

  if (identity) {
    res.cookie(getCookieName(JwtCookie.identity), identity.token, {
      expires: identity.expires,
      domain: cookieDomain,
      sameSite: secure ? "none" : "lax",
      secure,
    })
  }

  return res
}

export const deauthCookieResponse = (res: Response) => {
  res.clearCookie(getCookieName(SessionCookie.sid), {
    path: "/",
    domain: cookieDomain,
  })

  res.clearCookie(getCookieName(JwtCookie.access), {
    path: "/",
    domain: cookieDomain,
  })

  res.clearCookie(getCookieName(JwtCookie.refresh), {
    path: "/",
    domain: cookieDomain,
  })

  res.clearCookie(getCookieName(JwtCookie.identity), {
    path: "/",
    domain: cookieDomain,
  })
}

const defaultExtractorCookie = getCookieName(JwtCookie.access)

export const cookieExtractor = function (req: Request, cookie: string = defaultExtractorCookie) {
  let token = null
  if (req && req.cookies) token = req.cookies[cookie]
  if (!token && req && req.signedCookies) token = req.signedCookies[cookie]
  return token
}

export default authCookieResponse
