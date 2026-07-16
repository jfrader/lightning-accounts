import { NextFunction, Request, Response } from "express"
import httpStatus from "http-status"
import ApiError from "../utils/ApiError"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const normalizeOrigin = (origin: string): string | undefined => {
  try {
    return new URL(origin).origin
  } catch {
    return undefined
  }
}

const requestOrigin = (allowedOrigins: string[]) => {
  const allowAnyOrigin = allowedOrigins.includes("*")
  const trustedOrigins = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean))

  return (req: Request, _res: Response, next: NextFunction) => {
    const originHeader = req.get("origin")
    if (SAFE_METHODS.has(req.method) || !originHeader || allowAnyOrigin) {
      next()
      return
    }

    const origin = normalizeOrigin(originHeader)
    const host = req.get("host")
    const requestOrigin = host ? normalizeOrigin(`${req.protocol}://${host}`) : undefined

    if (origin && (trustedOrigins.has(origin) || origin === requestOrigin)) {
      next()
      return
    }

    next(new ApiError(httpStatus.FORBIDDEN, "Invalid request origin"))
  }
}

export default requestOrigin
