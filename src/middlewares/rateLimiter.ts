import rateLimit from "express-rate-limit"

export const authLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 60,
  message: "Rate limited!",
})
