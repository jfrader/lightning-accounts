import { NextFunction, Request, Response } from "express"
import { lightningService } from "../services"
import ApiError from "../utils/ApiError"
import httpStatus from "http-status"

export const lndConnected = (_req: Request, _res: Response, next: NextFunction) => {
  if (!lightningService.connected) {
    return lightningService
      .init()
      .then(() => next())
      .catch(() =>
        next(
          new ApiError(
            httpStatus.SERVICE_UNAVAILABLE,
            "Deposits and withdrawals are temporarily unavailable, please try again later"
          )
        )
      )
  }

  next()
}
