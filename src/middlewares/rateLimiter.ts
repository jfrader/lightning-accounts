import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit"
import { Request } from "express"
import { createHash } from "node:crypto"

const normalizeIp = (ip: string): string => (ip.startsWith("::ffff:") ? ip.slice(7) : ip)

const getClientIp = (req: Request): string => {
  const clientIp = typeof req.ip === "string" && req.ip.length > 0 ? req.ip : "unknown"
  return normalizeIp(clientIp)
}

export const keyGenerator = (req: Request): string => ipKeyGenerator(getClientIp(req))

const BASE_LIMITER: Partial<Options> = {
  message: { message: "Too many requests, please try again later." },
  keyGenerator,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." })
  },
}

export const AUTH_RATE_LIMIT = 50
export const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

export const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT,
  skipFailedRequests: false,
  ...BASE_LIMITER,
})

export const recipientKeyGenerator = (req: Request): string => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
  return email ? createHash("sha256").update(email).digest("hex") : keyGenerator(req)
}

export const recipientLimiter = rateLimit({
  ...BASE_LIMITER,
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: recipientKeyGenerator,
  skipFailedRequests: false,
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
