import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit"
import { Request } from "express"
import { createHash } from "node:crypto"
import { cookieExtractor } from "../utils/authCookie"
import { JwtCookie } from "../types"

const normalizeIp = (ip: string): string => (ip.startsWith("::ffff:") ? ip.slice(7) : ip)

const getClientIp = (req: Request): string => {
  const clientIp = typeof req.ip === "string" && req.ip.length > 0 ? req.ip : "unknown"
  return normalizeIp(clientIp)
}

export const keyGenerator = (req: Request): string => ipKeyGenerator(getClientIp(req))

/**
 * Buckets authenticated traffic per bearer session instead of per source IP, so
 * unrelated users behind one NAT do not share a limit. Unauthenticated routes
 * use keyGenerator and the credential limiters below.
 */
export const principalKeyGenerator = (req: Request): string => {
  const accessCookie = cookieExtractor(req, JwtCookie.access)
  if (accessCookie) {
    return accessCookie
  }

  const refreshCookie = cookieExtractor(req, JwtCookie.refresh)
  if (refreshCookie) {
    return refreshCookie
  }

  return keyGenerator(req)
}

const BASE_LIMITER: Partial<Options> = {
  message: { message: "Too many requests, please try again later." },
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." })
  },
}

export const AUTH_RATE_LIMIT = 50
export const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

export const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT,
  skipFailedRequests: true,
  keyGenerator: principalKeyGenerator,
  ...BASE_LIMITER,
})

/** Limits credential endpoints by source IP; arbitrary cookies cannot mint a bucket. */
export const authAttemptLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT,
  skipFailedRequests: false,
  keyGenerator,
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
  keyGenerator: principalKeyGenerator,
  ...BASE_LIMITER,
})

export const walletLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  skipFailedRequests: true,
  keyGenerator: principalKeyGenerator,
  ...BASE_LIMITER,
})

export const feedbackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  skipFailedRequests: true,
  keyGenerator: principalKeyGenerator,
  ...BASE_LIMITER,
})
