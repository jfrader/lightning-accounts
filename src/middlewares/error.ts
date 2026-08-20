import { ErrorRequestHandler, RequestHandler } from "express"
import { Prisma } from "@prisma/client"
import { STATUS_CODES } from "node:http"
import httpStatus from "http-status"
import config from "../config/config"
import logger from "../config/logger"
import { captureRequestError, observability } from "../observability"
import ApiError from "../utils/ApiError"

const MAX_ROUTE_TEMPLATE_LENGTH = 160
const ROUTE_TEMPLATE_FALLBACK = "/unmatched"
const CLIENT_PRISMA_ERROR_CODES = new Set(["P2002", "P2003", "P2025"])

type HttpError = Error & {
  status?: unknown
  statusCode?: unknown
  type?: unknown
}

const getClientStatusCode = (error: HttpError): number | undefined => {
  for (const statusCode of [error.statusCode, error.status]) {
    if (
      typeof statusCode === "number" &&
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return statusCode
    }
  }
  return undefined
}

const getRouteTemplate = (
  req: Parameters<ErrorRequestHandler>[1],
  res: Parameters<ErrorRequestHandler>[2]
) => {
  const baseUrl = res.locals.observabilityRouteBase ?? ""
  const routePath = req.route?.path
  if (
    baseUrl === ROUTE_TEMPLATE_FALLBACK ||
    typeof baseUrl !== "string" ||
    typeof routePath !== "string" ||
    !routePath.startsWith("/") ||
    /[\u0000-\u001f\u007f?#]/u.test(`${baseUrl}${routePath}`)
  ) {
    return ROUTE_TEMPLATE_FALLBACK
  }

  const routeTemplate = `${baseUrl}${routePath}`
  return routeTemplate.length <= MAX_ROUTE_TEMPLATE_LENGTH ? routeTemplate : ROUTE_TEMPLATE_FALLBACK
}

export const captureRouteBase =
  (routeBase: string): RequestHandler =>
  (_req, res, next) => {
    const parentRouteBase = res.locals.observabilityRouteBase ?? ""
    const routeTemplate = `${parentRouteBase}${routeBase}`
    res.locals.observabilityRouteBase =
      parentRouteBase === ROUTE_TEMPLATE_FALLBACK ||
      !routeBase.startsWith("/") ||
      routeTemplate.length > MAX_ROUTE_TEMPLATE_LENGTH ||
      /[\u0000-\u001f\u007f?#]/u.test(routeTemplate)
        ? ROUTE_TEMPLATE_FALLBACK
        : routeTemplate
    next()
  }

export const errorConverter: ErrorRequestHandler = (err, _req, _res, next) => {
  let error = err
  if (!(error instanceof ApiError)) {
    const httpError = error as HttpError
    const prismaError = error instanceof Prisma.PrismaClientKnownRequestError
    const prismaStatusCode =
      prismaError && CLIENT_PRISMA_ERROR_CODES.has(error.code) ? httpStatus.BAD_REQUEST : undefined
    const statusCode = prismaError
      ? (prismaStatusCode ?? httpStatus.INTERNAL_SERVER_ERROR)
      : (getClientStatusCode(httpError) ?? httpStatus.INTERNAL_SERVER_ERROR)
    const malformedJson = error instanceof SyntaxError && httpError.type === "entity.parse.failed"
    const statusMessage = STATUS_CODES[statusCode] ?? "Error"
    const message =
      malformedJson || prismaStatusCode ? statusMessage : error.message || statusMessage
    error = new ApiError(statusCode, message, statusCode < 500, err.stack)
  }
  next(error)
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
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

  if (typeof statusCode === "number" && statusCode >= httpStatus.INTERNAL_SERVER_ERROR) {
    captureRequestError(
      observability,
      { method: req.method, url: getRouteTemplate(req, res), statusCode },
      err
    )
  }

  if (["development", "test"].includes(config.env)) {
    logger.error(err)
  }

  res.status(statusCode).send(response)
}
