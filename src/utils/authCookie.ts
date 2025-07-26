import { Response, Request } from "express"
import { AuthTokensResponse } from "../types/response"
import config from "../config/config"
import { JwtCookie, SessionCookie } from "../types/tokens"

const secure = config.env === "production"

const authCookieResponse = ({ access, refresh, identity }: AuthTokensResponse, res: Response) => {
  if (access) {
    res.cookie(JwtCookie.access, access.token, {
      httpOnly: true,
      expires: access?.expires,
      domain: secure ? config.domain : undefined,
      sameSite: secure ? "none" : "lax",
      signed: secure,
      secure,
    })
  }

  if (refresh) {
    res.cookie(JwtCookie.refresh, refresh.token, {
      httpOnly: true,
      expires: refresh?.expires,
      domain: secure ? config.domain : undefined,
      sameSite: secure ? "none" : "lax",
      signed: secure,
      secure,
    })
  }

  if (identity) {
    res.cookie(JwtCookie.identity, identity.token, {
      expires: identity.expires,
      domain: secure ? config.domain : undefined,
      sameSite: secure ? "none" : "lax",
      secure,
    })
  }

  return res
}

export const deauthCookieResponse = (res: Response) => {
  res.clearCookie(SessionCookie.sid, { path: "/", domain: secure ? config.domain : undefined })
  res.clearCookie(JwtCookie.access, { path: "/", domain: secure ? config.domain : undefined })
  res.clearCookie(JwtCookie.refresh, { path: "/", domain: secure ? config.domain : undefined })
  res.clearCookie(JwtCookie.identity, { path: "/", domain: secure ? config.domain : undefined })
}

export const cookieExtractor = function (req: Request, cookie = JwtCookie.access) {
  let token = null
  console.log("Cookies:", req.cookies)
  console.log("Signed Cookies:", req.signedCookies)
  if (req && req.cookies) token = req.cookies[cookie]
  if (!token && req && req.signedCookies) token = req.signedCookies[cookie]
  console.log("Extracted Token:", token)
  return token
}

export default authCookieResponse
