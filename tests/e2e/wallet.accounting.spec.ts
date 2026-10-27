import { TransactionType } from "@prisma/client"
import { randomUUID } from "node:crypto"
import prisma from "../../src/client"
import * as walletLock from "../../src/services/lock.service"

const mockLightning = {
  createInvoice: jest.fn(),
  checkInvoice: jest.fn(),
  checkPayment: jest.fn(),
  decodeInvoice: jest.fn(),
  payInvoice: jest.fn(),
}

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: { wallet: { limit: 0 } },
}))
jest.mock("../../src/config/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock("../../src/services/lightning.service", () => ({
  __esModule: true,
  LND_TIMEOUT: 60000,
  default: mockLightning,
}))

import walletService from "../../src/services/wallet.service"

const lightning = mockLightning
let userId: number
let walletId: number
let paymentId: string

const invoiceResult = (id = paymentId, is_confirmed = true) => ({
  id,
  tokens: 100,
  is_confirmed,
  cltv_delta: 40,
  created_at: "2020-01-01T00:00:00Z",
  expires_at: "2020-01-02T00:00:00Z",
  description: "deposit",
  features: [],
  is_private: false,
  payments: [],
  received: is_confirmed ? 100 : 0,
  received_mtokens: is_confirmed ? "100000" : "0",
  secret: "secret",
})

const deposit = (walletImpacted = false, invoiceSettled = false) =>
  prisma.transaction.create({
    data: {
      walletId,
      type: TransactionType.DEPOSIT,
      amountInSats: 100,
      walletImpacted,
      invoiceSettled,
      invoice: { id: paymentId, request: "invoice", expires_at: "2020-01-01T00:00:00Z" },
    },
  })

const balance = async () =>
  (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balanceInSats
const reconcile = () => walletService.checkInconsistentTransactions()

beforeEach(async () => {
  jest.resetAllMocks()
  paymentId = randomUUID().replace(/-/g, "").repeat(2)
  const user = await prisma.user.create({
    data: { name: "accounting test", wallet: { create: { balanceInSats: 1000 } } },
    include: { wallet: true },
  })
  userId = user.id
  walletId = user.wallet!.id
  lightning.checkInvoice.mockImplementation(async () => invoiceResult())
  lightning.decodeInvoice.mockImplementation(async () => ({
    ...invoiceResult(),
    chain_address: "",
    description_hash: "",
    destination: "destination",
    mtokens: "100000",
    routes: [],
    safe_tokens: 100,
  }))
  lightning.checkPayment.mockImplementation(async () => ({ is_confirmed: true }))
})

afterEach(async () => {
  await prisma.transaction.deleteMany({ where: { walletId } })
  await prisma.wallet.delete({ where: { id: walletId } })
  await prisma.user.delete({ where: { id: userId } })
})

afterAll(() => prisma.$disconnect())

describe("Lightning accounting with PostgreSQL", () => {
  it("handles duplicate settlement callbacks before the invoice record commits", async () => {
    lightning.createInvoice.mockImplementation(
      async (_sats: number, onConfirmed: (event: ReturnType<typeof invoiceResult>) => void) => {
        onConfirmed(invoiceResult())
        onConfirmed(invoiceResult())
        return { ...invoiceResult(), request: "invoice" }
      }
    )
    const transaction = await walletService.createDepositInvoice(userId, 100)
    expect(transaction).toMatchObject({ walletImpacted: true, invoiceSettled: true })
    await Promise.all([reconcile(), reconcile()])
    expect(await balance()).toBe(1100)
  })

  it("rolls back the credit and claim together if the database cannot finish settlement", async () => {
    const transaction = await deposit(false, true)
    await prisma.$executeRawUnsafe(`CREATE FUNCTION accounting_reject_credit() RETURNS trigger AS $$
      BEGIN IF NEW.id = ${walletId} THEN RAISE EXCEPTION 'simulated crash'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER accounting_reject_credit AFTER UPDATE ON "Wallet"
      FOR EACH ROW EXECUTE FUNCTION accounting_reject_credit()`)
    try {
      const failure = await reconcile().catch((error: Error) => error)
      expect(await balance()).toBe(1000)
      expect(await prisma.transaction.findUnique({ where: { id: transaction.id } })).toMatchObject({
        walletImpacted: false,
        invoiceSettled: true,
      })
      expect(failure).toBeInstanceOf(Error)
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER accounting_reject_credit ON "Wallet"`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION accounting_reject_credit()`)
    }
    await reconcile()
    expect(await balance()).toBe(1100)
  })

  it("recovers a late settlement after expiry and a missed subscription, exactly once", async () => {
    const transaction = await deposit()
    await reconcile()
    await reconcile()
    expect(await balance()).toBe(1100)
    expect(await prisma.transaction.findUnique({ where: { id: transaction.id } })).toMatchObject({
      walletImpacted: true,
      invoiceSettled: true,
    })
  })

  it("does not credit an unconfirmed invoice", async () => {
    await deposit()
    lightning.checkInvoice.mockImplementation(async () => invoiceResult(paymentId, false))
    await reconcile()
    expect(await balance()).toBe(1000)
  })

  it("claims concurrent reconciliation observations once", async () => {
    await deposit(false, true)
    await Promise.all([reconcile(), reconcile()])
    expect(await balance()).toBe(1100)
  })

  it("preserves credited evidence across a restart before the settled flag was written", async () => {
    const transaction = await deposit(true, false)
    lightning.checkInvoice.mockRejectedValue(new Error("node restarting"))
    const failure = await reconcile().catch((error: Error) => error)
    expect(await prisma.transaction.findUnique({ where: { id: transaction.id } })).toMatchObject({
      walletImpacted: true,
      invoiceSettled: false,
    })
    expect(failure).toBeInstanceOf(Error)
    lightning.checkInvoice.mockImplementation(async () => invoiceResult())
    await reconcile()
    expect(await balance()).toBe(1000)
    expect(await prisma.transaction.findUnique({ where: { id: transaction.id } })).toMatchObject({
      invoiceSettled: true,
    })
  })

  it("rejects a second ledger record for the same invoice identity at the database boundary", async () => {
    await deposit()
    await expect(deposit()).rejects.toThrow()
    expect(await balance()).toBe(1000)
  })

  it("does not accept settlement evidence for another invoice", async () => {
    await deposit(false, true)
    lightning.checkInvoice.mockImplementation(async () => invoiceResult("another-invoice"))
    const failure = await reconcile().catch((error: Error) => error)
    expect(await balance()).toBe(1000)
    expect(failure).toBeInstanceOf(Error)
  })

  it("reconciles a lost withdrawal response without restoring spent funds", async () => {
    lightning.payInvoice.mockRejectedValue(new Error("response lost"))
    const transaction = await walletService.payWithdrawInvoice(userId, "invoice")
    expect(transaction).toMatchObject({ walletImpacted: true, invoiceSettled: true })
    expect(await balance()).toBe(895)
    await reconcile()
    expect(await balance()).toBe(895)
  })

  it("retains an unresolved debit through a restart and later confirms it once", async () => {
    lightning.payInvoice.mockRejectedValue(new Error("response lost"))
    lightning.checkPayment.mockRejectedValue(new Error("node restarting"))
    await expect(walletService.payWithdrawInvoice(userId, "invoice")).rejects.toThrow()
    expect(await balance()).toBe(895)
    lightning.checkPayment.mockImplementation(async () => ({ is_confirmed: true }))
    await Promise.all([reconcile(), reconcile()])
    expect(await balance()).toBe(895)
    expect(await prisma.transaction.findFirst({ where: { walletId } })).toMatchObject({
      invoiceSettled: true,
    })
  })

  it("refunds only a terminal failed withdrawal, once even with two workers", async () => {
    lightning.payInvoice.mockRejectedValue(new Error("response lost"))
    lightning.checkPayment.mockImplementation(async () => ({ is_pending: true }))
    await expect(walletService.payWithdrawInvoice(userId, "invoice")).rejects.toThrow()
    expect(await balance()).toBe(895)
    await reconcile()
    expect(await balance()).toBe(895)
    lightning.checkPayment.mockImplementation(async () => ({ is_failed: true }))
    await Promise.all([reconcile(), reconcile()])
    expect(await balance()).toBe(1000)
  })

  it("rejects a replayed withdrawal identity before submitting another payment", async () => {
    lightning.payInvoice.mockResolvedValue({})
    await walletService.payWithdrawInvoice(userId, "invoice")
    await expect(walletService.payWithdrawInvoice(userId, "invoice")).rejects.toThrow()
    expect(lightning.payInvoice).toHaveBeenCalledTimes(1)
    expect(await balance()).toBe(895)
  })

  it("prevents concurrent workers with independent process locks from paying twice", async () => {
    jest.spyOn(walletLock, "setWalletBusy").mockReturnValue(true)
    lightning.payInvoice.mockResolvedValue({})
    const results = await Promise.allSettled([
      walletService.payWithdrawInvoice(userId, "invoice"),
      walletService.payWithdrawInvoice(userId, "invoice"),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    expect(lightning.payInvoice).toHaveBeenCalledTimes(1)
    expect(await balance()).toBe(895)
  })

  it("leaves pending deposits unchanged during a dry run", async () => {
    await deposit()
    await walletService.checkInconsistentTransactions(true)
    expect(await balance()).toBe(1000)
  })
})
