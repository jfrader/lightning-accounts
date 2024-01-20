import { Response, Request } from "express"
import { AuthTokensResponse } from "../types/response"
import config from "../config/config"
import { JwtCookie } from "../types/tokens"

const secure = config.env === "production"

const authCookieResponse = ({ access, refresh, identity }: AuthTokensResponse, res: Response) => {
  return res
    .cookie(JwtCookie.access, access.token, {
      httpOnly: true,
      expires: access.expires,
      domain: config.origin,
      secure,
    })
    .cookie(JwtCookie.refresh, refresh?.token, {
      httpOnly: true,
      expires: refresh?.expires,
      domain: config.origin,
      secure,
    })
    .cookie(JwtCookie.identity, identity?.token, {
      expires: identity?.expires,
      domain: config.origin,
      secure,
    })
}

export const cookieExtractor = function (req: Request, cookie = JwtCookie.access) {
  let token = null
  if (req && req.cookies) token = req.cookies[cookie]
  if (!token && req && req.signedCookies) token = req.signedCookies[cookie]
  return token
}

export default authCookieResponse
