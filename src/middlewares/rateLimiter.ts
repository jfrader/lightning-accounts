import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit"
import { Request } from "express"
import config from "../config/config"
import { cookieExtractor } from "../utils/authCookie"
import { JwtCookie } from "../types"

const keyGenerator = (req: Request): string => {
  const xForwardedFor = req.headers["x-forwarded-for"]
  const xRealIp = req.headers["x-real-ip"]
  let clientIp: string | undefined

  const accessCookie = cookieExtractor(req, JwtCookie.access)
  if (accessCookie) {
    return accessCookie
  }

  if (Array.isArray(xForwardedFor)) {
    clientIp = xForwardedFor[0]?.trim() || (typeof xRealIp === "string" ? xRealIp.trim() : req.ip)
  } else if (typeof xForwardedFor === "string") {
    clientIp =
      xForwardedFor.split(",")[0]?.trim() || (typeof xRealIp === "string" ? xRealIp.trim() : req.ip)
  } else {
    clientIp = typeof xRealIp === "string" ? xRealIp.trim() : req.ip
  }

  return ipKeyGenerator(clientIp || "unknown")
}

const skipTrustedIps = (req: Request): boolean => {
  const key = keyGenerator(req)
  const isTrusted = config.trustedProxyIps.includes(key)
  return isTrusted
}

const BASE_LIMITER: Partial<Options> = {
  message: { message: "Too many requests, please try again later." },
  keyGenerator,
  skip: skipTrustedIps,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." })
  },
}

export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  skipFailedRequests: true,
  ...BASE_LIMITER,
})

export const userLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 75,
  skipFailedRequests: true,
  ...BASE_LIMITER,
})

export const walletLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  skipFailedRequests: true,
  ...BASE_LIMITER,
})
