const mockLnd = {}
const mockLightning = {
  authenticatedLndGrpc: jest.fn(() => ({ lnd: mockLnd })),
  decodePaymentRequest: jest.fn(),
  pay: jest.fn(),
  getPayment: jest.fn(),
  getInvoice: jest.fn(),
}

jest.mock("lightning", () => mockLightning)
jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: { lightning: { lndConfig: {} } },
}))
jest.mock("../../src/config/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import lightningService, { LND_TIMEOUT } from "../../src/services/lightning.service"
import PaymentFailure from "../../src/utils/PaymentFailure"

afterEach(() => jest.useRealTimers())

it.each([
  "PaymentExecutionCanceled",
  "InsufficientBalanceToAttemptPayment",
  "PaymentRejectedByDestination",
  "PaymentAttemptsTimedOut",
  "PaymentPathfindingFailedToFindPossibleRoute",
  "FailedToFindPayableRouteToDestination",
])("preserves terminal payment failure %s", async (message) => {
  mockLightning.decodePaymentRequest.mockImplementation((_args, callback) =>
    callback(null, { id: "hash" })
  )
  mockLightning.pay.mockImplementation((_args, callback) => callback([503, message]))
  await expect(lightningService.payInvoice("invoice")).rejects.toBeInstanceOf(PaymentFailure)
})

it("does not treat a transport error as evidence of payment failure", async () => {
  mockLightning.decodePaymentRequest.mockImplementation((_args, callback) =>
    callback(null, { id: "hash" })
  )
  mockLightning.pay.mockImplementation((_args, callback) =>
    callback([503, "UnexpectedErrorSendingPayment"])
  )
  await expect(lightningService.payInvoice("invoice")).rejects.not.toBeInstanceOf(PaymentFailure)
})

it("looks up outgoing payment history, not the local incoming invoice table", async () => {
  mockLightning.getPayment.mockResolvedValue({ is_pending: true })
  expect(await lightningService.checkPayment("hash")).toEqual({ is_pending: true })
  expect(mockLightning.getPayment).toHaveBeenCalledWith({ lnd: mockLnd, id: "hash" })
  expect(mockLightning.getInvoice).not.toHaveBeenCalled()
})

it("resolves a lost payment response from outgoing settlement evidence", async () => {
  jest.useFakeTimers()
  mockLightning.pay.mockImplementation(() => {})
  mockLightning.decodePaymentRequest.mockImplementation(
    (_args, callback: (error: null, payment: { id: string }) => void) =>
      callback(null, { id: "hash" })
  )
  mockLightning.getPayment.mockResolvedValue({ is_confirmed: true })
  const payment = lightningService.payInvoice("invoice")
  await jest.advanceTimersByTimeAsync(LND_TIMEOUT)
  expect(await payment).toEqual({ id: "hash", confirmed: true })
  expect(mockLightning.getInvoice).not.toHaveBeenCalled()
})
