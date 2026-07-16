import { Server } from "http"
import config from "./config/config"
import logger from "./config/logger"
import { initializeApp } from "./server"
import prisma from "./client"
import { setReady } from "./health"

export default () => {
  let server: Server | undefined
  let shuttingDown = false

  const exitHandler = async (requestedExitCode = 0) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    setReady(false)
    let exitCode = requestedExitCode

    if (server) {
      try {
        const activeServer = server
        await new Promise<void>((resolve, reject) => {
          activeServer.close((error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        })
        logger.info("Server closed")
      } catch (error) {
        exitCode = 1
        logger.error(error)
      }
    }

    try {
      await prisma.$disconnect()
      logger.info("Disconnected from SQL Database")
    } catch (error) {
      exitCode = 1
      logger.error(error)
    }

    process.exit(exitCode)
  }

  const unexpectedErrorHandler = (error: unknown) => {
    logger.error(error)
    void exitHandler(1)
  }

  initializeApp()
    .then((app) => {
      server = app
        .listen(config.port, () => {
          logger.info(`Listening to port ${config.port}`)
        })
        .on("error", (error: NodeJS.ErrnoException) => {
          logger.error(`Failed to listen on port ${config.port}: ${error.message}`)
          void exitHandler(1)
        })
    })
    .catch((error) => {
      logger.error(error)
      void exitHandler(1)
    })

  process.on("uncaughtException", unexpectedErrorHandler)
  process.on("unhandledRejection", unexpectedErrorHandler)

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received")
    void exitHandler()
  })

  process.on("SIGINT", () => {
    logger.info("SIGINT received")
    void exitHandler()
  })
}
