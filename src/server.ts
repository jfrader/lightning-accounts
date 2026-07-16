import prisma from "./client"
import config from "./config/config"
import logger from "./config/logger"
import lightningService from "./services/lightning.service"
import walletService from "./services/wallet.service"
import app from "./app"
import { setReady } from "./health"

export const initializeApp = async () => {
  setReady(false)
  await prisma.$connect()
  setReady(true)
  logger.info("Connected to SQL Database")

  if (!config.wallet.enabled) {
    logger.warn("Lightning wallet and payment functionality is disabled")
    return app
  }

  const dryRun = config.wallet.reconcileDryRun
  logger.info(`Starting reconciliation with dryRun=${dryRun}`)

  try {
    await lightningService.initLightning()
    logger.info("Connected to LND at " + config.lightning.lndConfig.socket)

    await walletService.checkInconsistentTransactions(dryRun).catch((error) => {
      logger.error(
        `Failed to reconcile transactions on startup (dryRun=${dryRun}): ${error.message}`
      )
    })
  } catch (error) {
    if (Array.isArray(error) && error.length >= 3) {
      const [status, statusText, obj] = error
      logger.warn(`LND connection failed: ${obj?.err?.details} - ${status} ${statusText}`)
    } else {
      logger.warn(
        `LND initialization error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  logger.info(`Server initialization completed (reconciliation dryRun=${dryRun})`)
  return app
}
