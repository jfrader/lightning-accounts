import * as lightning from "lightning"
import ApiError from "../utils/ApiError"
import httpStatus from "http-status"
import config from "../config/config"
import logger from "../config/logger"

export const LND_TIMEOUT = 60 * 1000

let connected = false
let lnd: lightning.AuthenticatedLnd | null = null
let lndInfo: lightning.GetWalletInfoResult | null = null

try {
  const { lnd: authenticatedLnd } = lightning.authenticatedLndGrpc({
    cert: config.lightning.lndConfig.cert,
    macaroon: config.lightning.lndConfig.macaroon,
    socket: config.lightning.lndConfig.socket,
  })
  lnd = authenticatedLnd
} catch (error) {
  logger.error(
    `Failed to initialize LND client: ${error instanceof Error ? error.message : "Unknown error"}`
  )
  throw error
}

const initLightning = () =>
  new Promise<lightning.GetWalletInfoResult>((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }

    if (lnd && lndInfo) {
      return resolve(lndInfo)
    }

    logger.info("Getting lnd wallet info")
    lightning.getWalletInfo({ lnd }, (err, result) => {
      logger.info("Got lnd wallet info " + (result?.version || "unknown"))
      if (err) {
        connected = false
        return reject(err)
      }

      lndInfo = result
      connected = true
      resolve(result)
    })
  })

/**
 * Close the LND client connection
 * @returns {Promise<void>}
 */
const close = async (): Promise<void> => {
  if (lnd) {
    lnd = null
    connected = false
    logger.info("LND client connection closed")
  }
}

/**
 * Pay a lightning invoice
 * @param {string} request
 * @param {number} [tokens]
 * @returns {Promise}
 */
const payInvoice = (request: string, tokens?: number) => {
  return new Promise((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }

    // Decode invoice to get its ID for potential timeout check
    lightning.decodePaymentRequest({ lnd, request }, (decodeError, decodeResult) => {
      if (decodeError || !decodeResult) {
        return reject(
          decodeError ||
            new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to decode payment request")
        )
      }

      const invoiceId = decodeResult.id

      const timeout = setTimeout(() => {
        logger.info(
          `Payment for invoice ${invoiceId}: Timed out after ${LND_TIMEOUT}ms, checking invoice status`
        )

        // Retry utility for checkInvoice
        const retryCheckInvoice = async <T>(
          fn: () => Promise<T>,
          retries = 3,
          delay = 1000
        ): Promise<T> => {
          try {
            return await fn()
          } catch (error) {
            if (retries === 0) throw error
            logger.warn(`Retrying invoice check for ${invoiceId}, ${retries} attempts left`)
            await new Promise((resolve) => setTimeout(resolve, delay))
            return retryCheckInvoice(fn, retries - 1, delay)
          }
        }

        // Check invoice status after timeout
        retryCheckInvoice(() => checkInvoice(invoiceId))
          .then((invoiceStatus) => {
            logger.info(
              `Invoice ${invoiceId} status after timeout - confirmed=${invoiceStatus.is_confirmed}`
            )
            if (invoiceStatus.is_confirmed) {
              // Payment succeeded despite timeout
              resolve({ id: invoiceId, confirmed: true })
            } else {
              reject(
                new ApiError(
                  httpStatus.REQUEST_TIMEOUT,
                  "Withdrawal timed out and invoice not confirmed"
                )
              )
            }
          })
          .catch((checkError) => {
            logger.error(
              `Failed to check invoice ${invoiceId} after timeout: ${checkError.message}`
            )
            reject(
              new ApiError(
                httpStatus.SERVICE_UNAVAILABLE,
                `Withdrawal timed out and invoice check failed: ${checkError.message}`
              )
            )
          })
      }, LND_TIMEOUT)

      if (!lnd) {
        return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
      }

      lightning.pay({ lnd, request, tokens }, (error, result) => {
        clearTimeout(timeout)
        if (error) {
          const [, message, details] = error
          logger.error(`Payment failed for invoice ${invoiceId}: ${message || "Unknown error"}`, {
            details,
          })
          return reject(
            new ApiError(httpStatus.INTERNAL_SERVER_ERROR, message || "Failed to pay invoice")
          )
        }
        logger.info(`Payment successful for invoice ${invoiceId}`, { payment: result })
        resolve(result)
      })
    })
  })
}

/**
 * Create a lightning invoice
 * @param {number} sats
 * @param {(invoice: lightning.SubscribeToInvoiceInvoiceUpdatedEvent) => void} onConfirmed
 * @returns {Promise<lightning.CreateInvoiceResult>}
 */
const createInvoice = async (
  sats: number,
  onConfirmed: (invoice: lightning.SubscribeToInvoiceInvoiceUpdatedEvent) => void
): Promise<lightning.CreateInvoiceResult> => {
  return new Promise((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }
    const timeout = setTimeout(() => {
      reject(new ApiError(httpStatus.REQUEST_TIMEOUT, "Invoice creation timed out"))
    }, LND_TIMEOUT)

    lightning.createInvoice(
      { lnd, tokens: sats, is_including_private_channels: true },
      (error, result) => {
        if (error || !result) {
          clearTimeout(timeout)
          return reject(
            error ||
              new ApiError(
                httpStatus.SERVICE_UNAVAILABLE,
                "Deposits are temporarily unavailable, please try again later"
              )
          )
        }

        if (!lnd) {
          return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
        }

        lightning
          .subscribeToInvoice({ lnd, id: result.id })
          .on("invoice_updated", (invoice: lightning.SubscribeToInvoiceInvoiceUpdatedEvent) => {
            if (invoice.is_confirmed) {
              logger.info(`Invoice confirmed: ${result.id}`)
              onConfirmed(invoice)
            }
          })
          .on("error", (err) => {
            logger.error(`Invoice subscription error for ${result.id}: ${err}`)
          })

        clearTimeout(timeout)
        resolve(result)
      }
    )
  })
}

/**
 * Decode a lightning invoice
 * @param {string} invoice
 * @returns {Promise<lightning.DecodePaymentRequestResult>}
 */
const decodeInvoice = async (invoice: string) => {
  return new Promise<lightning.DecodePaymentRequestResult>((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }
    lightning.decodePaymentRequest({ lnd, request: invoice }, (error, result) => {
      if (error || !result) {
        return reject(
          error ||
            new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to decode payment request")
        )
      }
      resolve(result)
    })
  })
}

/**
 * Check a lightning invoice
 * @param {string} invoiceId
 * @returns {Promise<lightning.GetInvoiceResult>}
 */
const checkInvoice = async (invoiceId: string) => {
  return new Promise<lightning.GetInvoiceResult>((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }
    lightning.getInvoice({ lnd, id: invoiceId }, (error, result) => {
      if (error || !result) {
        return reject(
          error || new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to check invoice payment")
        )
      }
      resolve(result)
    })
  })
}

/**
 * Get the latest Bitcoin block hash from the network
 * @returns {Promise<{ hash: string; height: number }>}
 */
const getLatestBlockHash = async (): Promise<{ hash: string; height: number }> => {
  return new Promise((resolve, reject) => {
    if (!lnd) {
      return reject(new ApiError(httpStatus.SERVICE_UNAVAILABLE, "LND client not initialized"))
    }
    const timeout = setTimeout(() => {
      reject(
        new ApiError(httpStatus.REQUEST_TIMEOUT, "Failed to retrieve latest block hash: Timed out")
      )
    }, LND_TIMEOUT)

    lightning.getWalletInfo({ lnd }, (error, result) => {
      if (error || !result) {
        clearTimeout(timeout)
        return reject(
          error ||
            new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve latest block hash")
        )
      }
      clearTimeout(timeout)
      resolve({ hash: result.current_block_hash, height: result.current_block_height })
    })
  })
}

export default {
  initLightning,
  close,
  connected,
  payInvoice,
  createInvoice,
  decodeInvoice,
  checkInvoice,
  getLatestBlockHash,
  lightningClient: lnd,
}
