import * as lightning from "lightning"
import ApiError from "../utils/ApiError"
import httpStatus from "http-status"
import config from "../config/config"
import logger from "../config/logger"

let connected = false

const { lnd } = lightning.authenticatedLndGrpc({
  cert: config.lightning.lndConfig.cert,
  macaroon: config.lightning.lndConfig.macaroon,
  socket: config.lightning.lndConfig.socket,
})

const init = () =>
  new Promise<lightning.GetWalletInfoResult>((resolve, reject) => {
    lightning.getWalletInfo({ lnd }, (err, result) => {
      if (err) {
        connected = false
        return reject(err)
      }
      connected = true
      resolve(result)
    })
  })

init()
  .then(() => {
    logger.info("Connected to LND at " + config.lightning.lndConfig.socket)
  })
  .catch(([status, statusText, obj]) => {
    logger.warn("Unable to connect to LND. Make sure you have configured the LND options in .env")
    logger.error([obj.err.details, status, statusText].join(" - "))
  })

/**
 * Pay a lightning invoice
 * @param {string} request
 * @returns {Promise}
 */
const payInvoice = async (request: string, tokens?: number) => {
  return new Promise((resolve, reject) => {
    lightning.pay({ lnd, request, tokens }, (error, result) => {
      if (error) {
        const [, message] = error
        reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, message || "Failed to pay invoice"))
      }
      resolve(result)
    })
  })
}

/**
 * Create a lightning invoice
 * @param {string} invoice
 * @returns {Promise}
 */
const createInvoice = async (
  sats: number,
  onConfirmed: (invoice: lightning.SubscribeToInvoiceInvoiceUpdatedEvent) => void
): Promise<lightning.CreateInvoiceResult> => {
  return new Promise((resolve, reject) => {
    lightning.createInvoice({ lnd, tokens: sats }, (error, result) => {
      if (error || !result) {
        reject(
          error ||
            new ApiError(
              httpStatus.SERVICE_UNAVAILABLE,
              "Deposits are temporarily unavailable, please try again later"
            )
        )
      }

      lightning
        .subscribeToInvoice({ lnd, id: result.id })
        .on("invoice_updated", (invoice: lightning.SubscribeToInvoiceInvoiceUpdatedEvent) => {
          if (invoice.is_confirmed) {
            onConfirmed(invoice)
          }
        })
      resolve(result)
    })
  })
}

/**
 * Decode a lightning invoice
 * @param {string} invoice
 * @returns {Promise<DecodePaymentRequestResult>}
 */
const decodeInvoice = async (invoice: string) => {
  return new Promise<lightning.DecodePaymentRequestResult>((resolve, reject) => {
    lightning.decodePaymentRequest({ lnd, request: invoice }, (error, result) => {
      if (error) {
        return reject(error)
      }

      return resolve(result)
    })
  })
}

export default {
  init,
  connected,
  payInvoice,
  createInvoice,
  decodeInvoice,
}
