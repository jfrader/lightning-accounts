import { Request } from "express"
import morgan from "morgan"
import config from "./config"
import logger from "./logger"

export const redactRequestUrl = (url: string): string => url.split(/[?#]/, 1)[0]
morgan.token("safe-url", (req: Request) => redactRequestUrl(req.originalUrl || req.url || ""))

const getIpFormat = () => (config.env === "production" ? ":remote-addr - " : "")
const successResponseFormat = `${getIpFormat()}:method :safe-url :status - :response-time ms`
const errorResponseFormat = `${getIpFormat()}:method :safe-url :status - :response-time ms`

export const successHandler = morgan(successResponseFormat, {
  skip: (req, res) => res.statusCode >= 400,
  stream: { write: (message) => logger.info(message.trim()) },
})

export const errorHandler = morgan(errorResponseFormat, {
  skip: (req, res) => res.statusCode < 400,
  stream: { write: (message) => logger.error(message.trim()) },
})

export default {
  successHandler,
  errorHandler,
}
