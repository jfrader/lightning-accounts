import { Server } from "http"
import config from "./config/config"
import logger from "./config/logger"
import { initializeApp } from "./server"
import prisma from "./client"
import { setReady } from "./health"
import { createReadinessMonitor } from "./readinessMonitor"
import { captureFatalException, FatalErrorOrigin, observability } from "./observability"

export default () => {
  let server: Server | undefined
  let shuttingDown = false
  let readinessMonitor: ReturnType<typeof createReadinessMonitor> | undefined

  const reportFailure = (error: unknown, phase: "startup" | "runtime" | "shutdown") => {
    logger.error(error)
    observability.captureException(error, { tags: { phase } })
  }

  const exitHandler = async (requestedExitCode = 0) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    readinessMonitor?.stop()
    setReady(false)
    let exitCode = requestedExitCode

    if (server?.listening) {
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
        reportFailure(error, "shutdown")
      }
    }

    try {
      await prisma.$disconnect()
      logger.info("Disconnected from SQL Database")
    } catch (error) {
      exitCode = 1
      reportFailure(error, "shutdown")
    }

    try {
      await observability.flush()
    } catch (error) {
      logger.error(error)
    }

    process.exit(exitCode)
  }

  const unexpectedErrorHandler = (origin: FatalErrorOrigin) => (error: unknown) => {
    logger.error(error)
    captureFatalException(error, origin)
    void exitHandler(1)
  }

  initializeApp()
    .then((app) => {
      if (shuttingDown) {
        setReady(false)
        return
      }

      readinessMonitor = createReadinessMonitor({
        probe: () => prisma.$queryRaw`SELECT 1`,
        onTransition: (status, error) => {
          if (status === "ready") {
            logger.info("SQL Database readiness recovered")
          } else {
            const errorType = error instanceof Error ? error.name : "UnknownError"
            logger.error(`SQL Database readiness probe failed (${errorType})`)
          }
        },
      })
      readinessMonitor.start()
      server = app
        .listen(config.port, () => {
          logger.info(`Listening to port ${config.port}`)
        })
        .on("error", (error: NodeJS.ErrnoException) => {
          logger.error(`Failed to listen on port ${config.port}: ${error.message}`)
          observability.captureException(error, { tags: { phase: "startup" } })
          void exitHandler(1)
        })
    })
    .catch((error) => {
      if (shuttingDown) {
        return
      }

      reportFailure(error, "startup")
      void exitHandler(1)
    })

  process.on("uncaughtException", unexpectedErrorHandler("uncaughtException"))
  process.on("unhandledRejection", unexpectedErrorHandler("unhandledRejection"))

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received")
    void exitHandler()
  })

  process.on("SIGINT", () => {
    logger.info("SIGINT received")
    void exitHandler()
  })
}
