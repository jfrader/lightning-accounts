import rateLimit from "express-rate-limit"
import { Request } from "express"

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: { message: "Too many requests, please try again later." },
  keyGenerator: (req: Request): string => {
    const xForwardedFor = req.headers["x-forwarded-for"]
    let clientIp: string | undefined

    if (Array.isArray(xForwardedFor)) {
      clientIp = xForwardedFor[0]?.trim() || req.ip
    } else if (typeof xForwardedFor === "string") {
      clientIp = xForwardedFor.split(",")[0].trim() || req.ip
    } else {
      clientIp = req.ip
    }

    return clientIp || "unknown"
  },
  skipFailedRequests: true,
  handler: (req, res) => {
    res.status(429).json({ message: "Too many requests, please try again later." })
  },
})
