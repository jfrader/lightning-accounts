import passport from "passport"
import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { UserPermission, roleRights } from "../config/roles"
import { NextFunction, Request, Response } from "express"
import { User } from "@prisma/client"
import { JwtCookie } from "../types/tokens"
import logger from "../config/logger"

const verifyCallback =
  (
    req: Request,
    resolve: (value?: unknown) => void,
    reject: (reason?: unknown) => void,
    requiredRights: UserPermission[]
  ) =>
  async (err: any, user: User | false, info: unknown) => {
    if (err || info || !user) {
      logger.warn(`Auth middleware failed: ${err?.message || info || "No user"}`)
      return reject(new ApiError(httpStatus.UNAUTHORIZED, err?.message || "Please authenticate"))
    }
    req.user = user

    if (requiredRights.length) {
      const userRights = roleRights.get(user.role) ?? []
      const hasRequiredRights = requiredRights.every((requiredRight) =>
        userRights.includes(requiredRight)
      )
      if (!hasRequiredRights && req.params.userId !== String(user.id)) {
        logger.warn(`Forbidden: User ${user.id} lacks required rights`)
        return reject(new ApiError(httpStatus.FORBIDDEN, "Forbidden"))
      }
    }

    resolve()
  }

const auth =
  (...requiredRights: UserPermission[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.debug(
        `Checking application strategy, session: ${req.sessionID}, cookies: ${JSON.stringify(
          req.cookies
        )}`
      )
      await new Promise((resolve, reject) => {
        passport.authenticate(
          "application",
          { session: false },
          verifyCallback(req, resolve, reject, requiredRights)
        )(req, res, next)
      })

      return next()
    } catch (e) {
      logger.debug("Application strategy failed, trying JWT")
    }

    try {
      logger.debug(`Checking JWT strategy, cookies: ${JSON.stringify(req.cookies)}`)
      await new Promise((resolve, reject) => {
        passport.authenticate(
          "jwt",
          { session: false },
          verifyCallback(req, resolve, reject, requiredRights)
        )(req, res, next)
      })

      return next()
    } catch (err: any) {
      logger.error(`Auth middleware error: ${err.message}`)
      if (err.statusCode === httpStatus.UNAUTHORIZED) {
        res.clearCookie(JwtCookie.access)
        res.clearCookie(JwtCookie.refresh)
      }
      next(new ApiError(httpStatus.UNAUTHORIZED, "Please authenticate"))
    }
  }

export default auth
