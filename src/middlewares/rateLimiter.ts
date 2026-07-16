import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit"
import { Request } from "express"
import config from "../config/config"
import { cookieExtractor } from "../utils/authCookie"
import { JwtCookie } from "../types"

const normalizeIp = (ip: string): string => (ip.startsWith("::ffff:") ? ip.slice(7) : ip)

const getClientIp = (req: Request): string => {
  const clientIp = typeof req.ip === "string" && req.ip.length > 0 ? req.ip : "unknown"
  return normalizeIp(clientIp)
}

const keyGenerator = (req: Request): string => {
  const accessCookie = cookieExtractor(req, JwtCookie.access)
  if (accessCookie) {
    return accessCookie
  }

  return ipKeyGenerator(getClientIp(req))
}

const skipTrustedIps = (req: Request): boolean => {
  return config.trustedProxyIps.includes(getClientIp(req))
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

export const feedbackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  skipFailedRequests: true,
  ...BASE_LIMITER,
})
