import { ErrorRequestHandler } from "express"
import { Prisma } from "@prisma/client"
import httpStatus from "http-status"
import config from "../config/config"
import logger from "../config/logger"
import ApiError from "../utils/ApiError"

export const errorConverter: ErrorRequestHandler = (err, req, res, next) => {
  let error = err
  if (!(error instanceof ApiError)) {
    const statusCode =
      error.statusCode || error instanceof Prisma.PrismaClientKnownRequestError
        ? httpStatus.BAD_REQUEST
        : httpStatus.INTERNAL_SERVER_ERROR
    const message = error.message || httpStatus[statusCode]
    error = new ApiError(statusCode, message, false, err.stack)
  }
  next(error)
}

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  let { statusCode, message } = err
  if (config.env === "production" && !err.isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR]
  }

  res.locals.errorMessage = err.message

  const response = {
    code: statusCode,
    message,
    ...(["development", "test"].includes(config.env) && { stack: err.stack }),
  }

  if (["development", "test"].includes(config.env)) {
    logger.error(err)
  }

  res.status(statusCode).send(response)
}
