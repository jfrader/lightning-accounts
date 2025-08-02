import rateLimit, { Options } from "express-rate-limit"
import { Request } from "express"

const BASE_LIMITER: Partial<Options> = {
  message: { message: "Too many requests, please try again later." },
  keyGenerator: (req: Request): string => {
    const xForwardedFor = req.headers["x-forwarded-for"]
    const xRealIp = req.headers["x-real-ip"]
    let clientIp: string | undefined

    if (Array.isArray(xForwardedFor)) {
      clientIp = xForwardedFor[0]?.trim() || (typeof xRealIp === "string" ? xRealIp.trim() : req.ip)
    } else if (typeof xForwardedFor === "string") {
      clientIp =
        xForwardedFor.split(",")[0]?.trim() ||
        (typeof xRealIp === "string" ? xRealIp.trim() : req.ip)
    } else {
      clientIp = typeof xRealIp === "string" ? xRealIp.trim() : req.ip
    }

    return clientIp || "unknown"
  },
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." })
  },
}

export const appLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipFailedRequests: true,
  ...BASE_LIMITER,
})

export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  ...BASE_LIMITER,
})
