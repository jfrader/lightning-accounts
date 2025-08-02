import winston from "winston"
import config from "./config"

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack })
  }
  return info
})

const logger = winston.createLogger({
  level: config.debug_level || "info",
  format: winston.format.combine(
    enumerateErrorFormat(),
    winston.format.timestamp(),
    ["development", "test"].includes(config.env)
      ? winston.format.colorize()
      : winston.format.uncolorize(),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error"],
      format: winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        const metaString = Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : ""
        return `${timestamp} ${level}: ${message}${metaString}`
      }),
    }),
  ],
})

export default logger
