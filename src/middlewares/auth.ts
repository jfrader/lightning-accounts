import { Request, Response, NextFunction } from "express"
import passport from "passport"
import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { UserPermission, roleRights } from "../config/roles"
import { User } from "@prisma/client"
import { cookieExtractor } from "../utils/authCookie"
import { JwtCookie } from "../types"

const verifyCallback =
  (
    req: Request,
    resolve: (value?: unknown) => void,
    reject: (reason?: unknown) => void,
    requiredRights: UserPermission[]
  ) =>
  async (err: any, user: User | false, _info: unknown) => {
    if (err) {
      return reject(new ApiError(httpStatus.UNAUTHORIZED, "Authentication error: " + err.message))
    }
    if (!user) {
      const token = cookieExtractor(req, JwtCookie.refresh)
      if (!token) {
        return reject(new ApiError(httpStatus.BAD_REQUEST, "No authentication token provided"))
      }
      return reject(new ApiError(httpStatus.UNAUTHORIZED, "Invalid or expired token"))
    }
    req.user = user

    if (requiredRights.length) {
      const userRights = roleRights.get(user.role) ?? []
      const hasRequiredRights = requiredRights.every((requiredRight) =>
        userRights.includes(requiredRight)
      )
      if (!hasRequiredRights && req.params.userId !== String(user.id)) {
        return reject(new ApiError(httpStatus.FORBIDDEN, "Forbidden"))
      }
    }

    resolve()
  }

const auth =
  (...requiredRights: UserPermission[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await new Promise((resolve, reject) => {
        passport.authenticate(
          "application",
          { session: false },
          verifyCallback(req, resolve, reject, requiredRights)
        )(req, res, next)
      })
      return next()
    } catch {
      // noop
    }

    try {
      await new Promise((resolve, reject) => {
        passport.authenticate(
          "jwt",
          { session: false },
          verifyCallback(req, resolve, reject, requiredRights)
        )(req, res, next)
      })
      return next()
    } catch (error) {
      return next(error)
    }
  }

export default auth
