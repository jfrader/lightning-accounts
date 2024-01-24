import passport from "passport"
import httpStatus from "http-status"
import ApiError from "../utils/ApiError"
import { UserPermission, roleRights } from "../config/roles"
import { NextFunction, Request, Response } from "express"
import { User } from "@prisma/client"
import { JwtCookie } from "../types/tokens"

const verifyCallback =
  (
    req: Request,
    resolve: (value?: unknown) => void,
    reject: (reason?: unknown) => void,
    requiredRights: UserPermission[]
  ) =>
  async (err: any, user: User | false, info: unknown) => {
    if (err || info || !user) {
      return reject(new ApiError(httpStatus.UNAUTHORIZED, err?.message || "Please authenticate"))
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
    return new Promise((resolve, reject) => {
      passport.authenticate(
        "application",
        { session: false },
        verifyCallback(
          req,
          resolve,
          () => {
            passport.authenticate(
              "jwt",
              { session: false },
              verifyCallback(req, resolve, reject, requiredRights)
            )(req, res, next)
          },
          requiredRights
        )
      )(req, res, next)
    })
      .then(() => next())
      .catch((err: ApiError) => {
        if (err.statusCode === httpStatus.UNAUTHORIZED) {
          res.clearCookie(JwtCookie.access)
        }
        next(err)
      })
  }

export default auth
