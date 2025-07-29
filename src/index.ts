import { Server } from "http"
import config from "./config/config"
import logger from "./config/logger"
import { initializeApp } from "./server"

export default () => {
  let server: Server

  const exitHandler = () => {
    if (server) {
      server.close(() => {
        logger.info("Server closed")
        process.exit(0)
      })
    } else {
      process.exit(0)
    }
  }

  const unexpectedErrorHandler = (error: unknown) => {
    logger.error(error)
    exitHandler()
  }

  initializeApp()
    .then((app) => {
      server = app
        .listen(config.port, () => {
          logger.info(`Listening to port ${config.port}`)
        })
        .on("error", (error: NodeJS.ErrnoException) => {
          logger.error(`Failed to listen on port ${config.port}: ${error.message}`)
          exitHandler()
        })
    })
    .catch((error) => {
      logger.error(error)
      exitHandler()
    })

  process.on("uncaughtException", unexpectedErrorHandler)
  process.on("unhandledRejection", unexpectedErrorHandler)

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received")
    exitHandler()
  })
}
