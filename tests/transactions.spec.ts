/* eslint-disable @typescript-eslint/no-non-null-assertion */
import request from "supertest"
import { Server } from "http"
import { initializeApp } from "../src/server"
import prisma from "../src/client"
import { TransactionType } from "@prisma/client"
import lightningService from "../src/services/lightning.service"

describe("Transaction, Reconciliation, and Wallet Routes E2E Tests", () => {
  let userId: number // Test user (0_e2e_player)
  let receiverId: number // Receiver user (1_e2e_player)
  let funderId: number // Funder user (2_e2e_player)
  let server: Server
  let cookie: string // For 0_e2e_player
  let receiverCookie: string // For 1_e2e_player
  let funderCookie: string // For 2_e2e_player
  let adminCookie: string // For admin@trucoshi.com

  beforeAll(async () => {
    const app = await initializeApp()

    await prisma.wallet.updateMany({
      data: { disabled: false },
    })

    const user = await prisma.user.findUnique({
      where: { email: "0_e2e_player@trucoshi.com" },
    })
    if (!user) throw new Error("E2E player not found in seed data")
    userId = user.id

    const receiver = await prisma.user.findUnique({
      where: { email: "1_e2e_player@trucoshi.com" },
    })
    if (!receiver) throw new Error("Receiver player not found in seed data")
    receiverId = receiver.id

    const funder = await prisma.user.findUnique({
      where: { email: "2_e2e_player@trucoshi.com" },
    })
    if (!funder) throw new Error("Funder player not found in seed data")
    funderId = funder.id

    server = app.listen(process.env.SERVER_PORT || 2999, () => {
      console.log(`Test server running on port ${process.env.SERVER_PORT || 2999}`)
    })

    const loginRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/auth/login")
      .send({
        email: "0_e2e_player@trucoshi.com",
        password: "secret",
      })
      .expect(200)

    const setCookieHeader = loginRes.headers["set-cookie"]
    if (!setCookieHeader || !Array.isArray(setCookieHeader)) {
      throw new Error("No cookie received from login")
    }
    cookie = setCookieHeader.find((c) => c.startsWith("access=")) || ""
    if (!cookie) {
      throw new Error("Access cookie not found in response")
    }

    const receiverLoginRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/auth/login")
      .send({
        email: "1_e2e_player@trucoshi.com",
        password: "secret",
      })
      .expect(200)

    const receiverSetCookieHeader = receiverLoginRes.headers["set-cookie"]
    if (!receiverSetCookieHeader || !Array.isArray(receiverSetCookieHeader)) {
      throw new Error("No cookie received from receiver login")
    }
    receiverCookie = receiverSetCookieHeader.find((c) => c.startsWith("access=")) || ""
    if (!receiverCookie) {
      throw new Error("Receiver access cookie not found in response")
    }

    const funderLoginRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/auth/login")
      .send({
        email: "2_e2e_player@trucoshi.com",
        password: "secret",
      })
      .expect(200)

    const funderSetCookieHeader = funderLoginRes.headers["set-cookie"]
    if (!funderSetCookieHeader || !Array.isArray(funderSetCookieHeader)) {
      throw new Error("No cookie received from funder login")
    }
    funderCookie = funderSetCookieHeader.find((c) => c.startsWith("access=")) || ""
    if (!funderCookie) {
      throw new Error("Funder access cookie not found in response")
    }

    const adminLoginRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/auth/login")
      .send({
        email: "admin@trucoshi.com",
        password: "trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123",
      })
      .expect(200)

    const adminSetCookieHeader = adminLoginRes.headers["set-cookie"]
    if (!adminSetCookieHeader || !Array.isArray(adminSetCookieHeader)) {
      throw new Error("No cookie received from admin login")
    }
    adminCookie = adminSetCookieHeader.find((c) => c.startsWith("access=")) || ""
    console.log("Admin cookie:", adminCookie)
    if (!adminCookie) {
      throw new Error("Admin access cookie not found in response")
    }

    await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/wallet/deposit")
      .set("Cookie", adminCookie)
      .send({ amountInSats: 500 })
      .expect(201)
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany({
      where: { walletId: { in: [userId, receiverId, funderId] } },
    })
    await prisma.payRequest.deleteMany({
      where: {
        OR: [
          { creatorId: { in: [userId, receiverId, funderId] } },
          { receiverId: { in: [userId, receiverId, funderId] } },
        ],
      },
    })
    await prisma.wallet.updateMany({
      where: { userId: { in: [userId, receiverId, funderId] } },
      data: { balanceInSats: 24000, busy: false, disabled: false },
    })
    jest.clearAllMocks()
    jest.spyOn(lightningService, "checkInvoice").mockRestore()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          console.error("Server close error:", err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
    await lightningService.close()
    await prisma.$disconnect()
    await new Promise((resolve) => setTimeout(resolve, 2000))
  })

  async function fundWallet(
    cookie: string,
    userId: number,
    amountInSats: number,
    skipBalanceUpdate = false
  ): Promise<string> {
    console.log(`Creating deposit for user ${userId} with amount ${amountInSats}`)
    const initialWallet = await prisma.wallet.findUnique({ where: { userId } })
    const initialBalance = initialWallet?.balanceInSats || 0
    console.log(`Initial balance for user ${userId}: ${initialBalance}`)

    const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/wallet/deposit")
      .set("Cookie", cookie)
      .send({ amountInSats })
      .expect(201)
    console.log(`Deposit response:`, depositRes.body)
    const invoice = depositRes.body.invoice.request
    const transactionId = depositRes.body.id

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { wallet: true },
    })
    if (!transaction || transaction.wallet.userId !== userId) {
      throw new Error(`Deposit transaction ${transactionId} does not belong to user ${userId}`)
    }

    console.log(`Paying invoice for transaction ${transactionId} with funder user`)
    await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
      .post("/v1/wallet/withdraw")
      .set("Cookie", funderCookie)
      .send({ invoice })
      .expect(200)

    if (!skipBalanceUpdate) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { walletImpacted: true, invoiceSettled: true },
      })
    }

    const updatedWallet = await prisma.wallet.findUnique({ where: { userId } })
    console.log(
      `Wallet ${updatedWallet?.id} balance after deposit: ${updatedWallet?.balanceInSats} satoshis`
    )
    if (!skipBalanceUpdate) {
      expect(updatedWallet!.balanceInSats).toBe(initialBalance + amountInSats)
    }
    return invoice
  }

  describe("Wallet Routes", () => {
    it("POST /wallet/deposit - should create a deposit invoice", async () => {
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", adminCookie)
        .send({ amountInSats: 500 })
        .expect(201)

      expect(res.body).toHaveProperty("id")
      expect(res.body.amountInSats).toBe(500)
      expect(res.body.type).toBe(TransactionType.DEPOSIT)
      expect(res.body.walletImpacted).toBe(false)
      expect(res.body.invoiceSettled).toBe(false)
      expect(res.body.invoice).toHaveProperty("id")
      expect(res.body.invoice).toHaveProperty("request")
    })

    it("POST /wallet/withdraw - should create a withdrawal transaction", async () => {
      await fundWallet(cookie, userId, 5000)
      await fundWallet(receiverCookie, receiverId, 5000)

      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", receiverCookie)
        .send({ amountInSats: 5000 })
        .expect(201)
      const depositInvoice = depositRes.body.invoice.request

      const initialWallet = await prisma.wallet.findUnique({ where: { userId } })
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/withdraw")
        .set("Cookie", cookie)
        .send({ invoice: depositInvoice })
        .expect(200)

      expect(res.body).toHaveProperty("id")
      expect(res.body.type).toBe(TransactionType.WITHDRAW)
      expect(res.body.amountInSats).toBe(5000)
      expect(res.body.walletImpacted).toBe(true)
      expect(res.body.invoiceSettled).toBe(true)
      expect(res.body.invoice).toHaveProperty("id")
      expect(res.body.invoice).toHaveProperty("request")

      const wallet = await prisma.wallet.findUnique({ where: { userId } })
      expect(wallet!.balanceInSats).toBe(initialWallet!.balanceInSats - 5000 - 250)
    })

    it("GET /wallet/deposit/:transactionId - should get deposit transaction", async () => {
      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", adminCookie)
        .send({ amountInSats: 500 })
        .expect(201)

      const transactionId = depositRes.body.id

      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .get(`/v1/wallet/deposit/${transactionId}`)
        .set("Cookie", adminCookie)
        .expect(200)

      expect(res.body.id).toBe(transactionId)
      expect(res.body.type).toBe(TransactionType.DEPOSIT)
      expect(res.body.amountInSats).toBe(500)
      expect(res.body.invoice).toHaveProperty("id")
      expect(res.body.invoice).toHaveProperty("request")
    })

    it("POST /wallet/pay-request - should create a payment request", async () => {
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay-request")
        .set("Cookie", adminCookie)
        .send({
          amountInSats: 200,
          receiverId,
          description: "Test pay request",
          meta: { test: true },
        })
        .expect(201)

      expect(res.body).toHaveProperty("id")
      expect(res.body.amountInSats).toBe(200)
      expect(res.body.receiver.id).toBe(receiverId)
      expect(res.body.description).toBe("Test pay request")
      expect(res.body.meta).toEqual({ test: true })
      expect(res.body.paid).toBe(false)
    })

    it("GET /wallet/pay-request/:payRequestId - should get a payment request", async () => {
      const createRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay-request")
        .set("Cookie", adminCookie)
        .send({
          amountInSats: 200,
          receiverId,
        })
        .expect(201)

      const payRequestId = createRes.body.id

      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .get(`/v1/wallet/pay-request/${payRequestId}`)
        .set("Cookie", adminCookie)
        .expect(200)

      expect(res.body.id).toBe(payRequestId)
      expect(res.body.amountInSats).toBe(200)
      expect(res.body.receiver.id).toBe(receiverId)
    })

    it("POST /wallet/pay-requests - should create multiple payment requests", async () => {
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay-requests")
        .set("Cookie", adminCookie)
        .send({
          amountInSats: 100,
          receiverIds: [receiverId],
          description: "Bulk pay requests",
          meta: { bulk: true },
        })
        .expect(201)

      expect(res.body).toHaveLength(1)
      expect(res.body[0].amountInSats).toBe(100)
      expect(res.body[0].receiver.id).toBe(receiverId)
      expect(res.body[0].description).toBe("Bulk pay requests")
      expect(res.body[0].meta).toEqual({ bulk: true })
    })

    it("GET /wallet/pay-requests - should get multiple payment requests", async () => {
      const createRes1 = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay-request")
        .set("Cookie", adminCookie)
        .send({ amountInSats: 100, receiverId })
        .expect(201)
      const createRes2 = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay-request")
        .set("Cookie", adminCookie)
        .send({ amountInSats: 100, receiverId })
        .expect(201)

      const payRequestIds = [createRes1.body.id, createRes2.body.id]

      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .get("/v1/wallet/pay-requests")
        .set("Cookie", adminCookie)
        .send({ payRequestIds })
        .expect(200)

      expect(res.body).toHaveLength(2)
      expect(res.body.map((pr: any) => pr.id).sort()).toEqual(payRequestIds.sort())
    })

    it("GET /wallet/latest-bitcoin-block - should get latest Bitcoin block", async () => {
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .get("/v1/wallet/latest-bitcoin-block")
        .set("Cookie", adminCookie)
        .expect(200)

      expect(res.body).toHaveProperty("hash")
      expect(res.body).toHaveProperty("height")
      expect(res.body.height).toBeGreaterThan(0)
    })

    it("POST /wallet/withdraw - should succeed for USER role", async () => {
      await fundWallet(cookie, userId, 5000)
      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", receiverCookie)
        .send({ amountInSats: 500 })
        .expect(201)
      const invoice = depositRes.body.invoice.request

      console.log("Attempting withdrawal with funder cookie:", funderCookie)
      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/withdraw")
        .set("Cookie", funderCookie)
        .send({ invoice })
        .expect(200)

      expect(res.body).toHaveProperty("id")
      expect(res.body.type).toBe(TransactionType.WITHDRAW)
      expect(res.body.amountInSats).toBe(500)
      expect(res.body.walletImpacted).toBe(true)
      expect(res.body.invoiceSettled).toBe(true)
      expect(res.body.invoice).toHaveProperty("id")
      expect(res.body.invoice).toHaveProperty("request")
    })

    it("POST /wallet/pay - should pay another user", async () => {
      await fundWallet(cookie, userId, 5000)
      const initialPayerWallet = await prisma.wallet.findUnique({ where: { userId } })
      const initialReceiverWallet = await prisma.wallet.findUnique({
        where: { userId: receiverId },
      })

      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/pay")
        .set("Cookie", cookie)
        .send({
          amountInSats: 100,
          userId: receiverId,
          description: "Test payment",
        })
        .expect(201)

      expect(res.body).toHaveProperty("id")
      expect(res.body.type).toBe(TransactionType.SEND)
      expect(res.body.amountInSats).toBe(100)
      expect(res.body.walletImpacted).toBe(true)
      expect(res.body.invoiceSettled).toBe(true)

      const payerWallet = await prisma.wallet.findUnique({ where: { userId } })
      const receiverWallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      expect(payerWallet!.balanceInSats).toBe(initialPayerWallet!.balanceInSats - 100)
      expect(receiverWallet!.balanceInSats).toBe(initialReceiverWallet!.balanceInSats + 100)
    })

    it("POST /wallet/pay-request/:payRequestId/pay - should pay a payment request", async () => {
      await fundWallet(receiverCookie, receiverId, 5000)
      const payRequest = await prisma.payRequest.create({
        data: {
          amountInSats: 150,
          creatorId: userId,
          receiverId,
          description: "Test pay request to pay",
        },
      })

      const initialWallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      const initialCreatorWallet = await prisma.wallet.findUnique({ where: { userId } })

      const res = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post(`/v1/wallet/pay-request/${payRequest.id}/pay`)
        .set("Cookie", receiverCookie)
        .expect(200)

      expect(res.body.id).toBe(payRequest.id)
      expect(res.body.paid).toBe(true)

      const updatedWallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      const updatedCreatorWallet = await prisma.wallet.findUnique({ where: { userId } })
      expect(updatedWallet!.balanceInSats).toBe(initialWallet!.balanceInSats - 150)
      expect(updatedCreatorWallet!.balanceInSats).toBe(initialCreatorWallet!.balanceInSats + 150)
    })
  })

  describe("Reconciliation Tests", () => {
    const initialWalletBalance = 24000

    beforeEach(async () => {
      await prisma.transaction.deleteMany({
        where: { walletId: { in: [userId, receiverId, funderId] } },
      })
      await prisma.payRequest.deleteMany({
        where: {
          OR: [
            { creatorId: { in: [userId, receiverId, funderId] } },
            { receiverId: { in: [userId, receiverId, funderId] } },
          ],
        },
      })
      await prisma.wallet.updateMany({
        where: { userId: { in: [userId, receiverId, funderId] } },
        data: { balanceInSats: 24000, busy: false, disabled: false },
      })
      jest.clearAllMocks()
      jest.spyOn(lightningService, "checkInvoice").mockRestore()
    })

    it("should reconcile DEPOSIT: walletImpacted=true, invoiceSettled=false (confirmed)", async () => {
      const transactionsBefore = await prisma.transaction.findMany({
        where: { walletId: userId },
      })
      console.log("Transactions before test:", transactionsBefore)
      expect(transactionsBefore).toHaveLength(0)

      await fundWallet(cookie, userId, 5000) // Sets balance to 29000
      const walletCheck = await prisma.wallet.findUnique({ where: { userId } })
      expect(walletCheck?.balanceInSats).toBe(29000)

      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", cookie)
        .send({ amountInSats: 500 })
        .expect(201)

      const transactionId = depositRes.body.id
      const invoice = depositRes.body.invoice.request

      await prisma.transaction.update({
        where: { id: transactionId },
        data: { walletImpacted: true },
      })

      await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/withdraw")
        .set("Cookie", funderCookie)
        .send({ invoice })
        .expect(200)

      await prisma.transaction.update({
        where: { id: transactionId },
        data: { invoiceSettled: false },
      })

      const initialTransaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })
      console.log("Initial transaction state:", initialTransaction)
      expect(initialTransaction!.walletImpacted).toBe(true)
      expect(initialTransaction!.invoiceSettled).toBe(false)
      expect(initialTransaction!.invoice).toHaveProperty("id")
      expect(initialTransaction!.invoice).toHaveProperty("request")

      const transactionsBeforeReconcile = await prisma.transaction.findMany({
        where: { walletId: userId },
      })
      console.log("Transactions before reconciliation:", transactionsBeforeReconcile)

      await new Promise<void>((resolve) => {
        server.close(async () => {
          const app = await initializeApp()
          server = app.listen(process.env.SERVER_PORT || 2999, () => {
            setTimeout(resolve, 2000) // Increased delay to avoid race conditions
          })
        })
      })

      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })
      console.log("Transaction state after restart:", transaction)
      expect(transaction!.walletImpacted).toBe(true)
      expect(transaction!.invoiceSettled).toBe(true)
      expect(transaction!.invoice).toHaveProperty("id")
      expect(transaction!.invoice).toHaveProperty("request")

      const wallet = await prisma.wallet.findUnique({ where: { userId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(initialWalletBalance + 5000 + 500) // 29500
    })

    it("should reconcile DEPOSIT: walletImpacted=true, invoiceSettled=false (not confirmed)", async () => {
      const transactionsBefore = await prisma.transaction.findMany({
        where: { walletId: userId },
      })
      console.log("Transactions before test:", transactionsBefore)
      expect(transactionsBefore).toHaveLength(0)

      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", cookie)
        .send({ amountInSats: 500 })
        .expect(201)

      const transactionId = depositRes.body.id

      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transactionId },
          data: { walletImpacted: true, invoiceSettled: false },
        })
        await tx.wallet.update({
          where: { userId },
          data: { balanceInSats: { increment: 500 } },
        })
      })

      const initialTransaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })
      console.log("Initial transaction state:", initialTransaction)
      expect(initialTransaction!.walletImpacted).toBe(true)
      expect(initialTransaction!.invoiceSettled).toBe(false)
      expect(initialTransaction!.invoice).toHaveProperty("id")
      expect(initialTransaction!.invoice).toHaveProperty("request")

      const transactionsBeforeReconcile = await prisma.transaction.findMany({
        where: { walletId: userId },
      })
      console.log("Transactions before reconciliation:", transactionsBeforeReconcile)

      jest.spyOn(lightningService, "checkInvoice").mockImplementation((invoiceId) => {
        console.log(`Mock checkInvoice called with invoiceId: ${invoiceId}`)
        return Promise.resolve({ is_confirmed: false } as any)
      })

      await new Promise<void>((resolve) => {
        server.close(async () => {
          const app = await initializeApp()
          server = app.listen(process.env.SERVER_PORT || 2999, () => {
            setTimeout(resolve, 2000) // Increased delay
          })
        })
      })

      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })
      console.log("Transaction state after restart:", transaction)
      expect(transaction!.walletImpacted).toBe(false)
      expect(transaction!.invoiceSettled).toBe(false)
      expect(transaction!.invoice).toHaveProperty("id")
      expect(transaction!.invoice).toHaveProperty("request")

      const wallet = await prisma.wallet.findUnique({ where: { userId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(initialWalletBalance) // 24000
    })

    it("should reconcile DEPOSIT: walletImpacted=false, invoiceSettled=true", async () => {
      console.log(
        "Transactions before test:",
        await prisma.transaction.findMany({
          where: { walletId: { in: [userId, receiverId, funderId] } },
        })
      )

      await fundWallet(cookie, userId, 5000) // Ensure initial balance is 29000
      await prisma.transaction.create({
        data: {
          walletId: userId,
          amountInSats: 500,
          type: TransactionType.DEPOSIT,
          walletImpacted: false,
          invoiceSettled: true,
          invoice: {
            id: "test-invoice-id-4",
            request:
              "lnbcrt5u1p5gss9app5vpxxlze6fthq6s445qsrcq3lnd7qv0zza6z9hrcjq0w4y7mtl0nsdqqcqpjxqr23ssp5s6n2klwgxr8yez8vjd2m69gfu054xz5kadrjp2dmwpzvtrz0rnps9qxpqysgqy20472ckgqwdk97n55f3xqvgdvu3yf8me6spadrh83txnl7fvqfjz6qa6pz875fh0p3u2ekvx6hqx7hzaxc55z0k3pfgu6k4k06cz4sqwvjj6s",
            index: 866,
            secret: "f85bdd893f63ac32c9ebb185a1b812888e9679642253bbc695226fb0d3b54352",
            tokens: 500,
            mtokens: "500000",
            payment: "86a6ab7dc830ce4c88ec9355bd1509e3e9530a96eb4720a9bb7044c58c4f1cc3",
            features: [],
            payments: [],
            received: 500,
            cltv_delta: 18,
            created_at: "2025-07-29T03:32:13.000Z",
            expires_at: "2025-07-29T06:32:13.000Z",
            is_private: false,
            description: "",
            confirmed_at: "2025-07-29T03:32:13.000Z",
            is_confirmed: true,
            confirmed_index: 522,
            received_mtokens: "500000",
          },
        },
      })

      const transaction = await prisma.transaction.findFirst({
        where: { walletId: userId, amountInSats: 500, type: TransactionType.DEPOSIT },
      })
      console.log("Initial transaction state:", transaction)

      const transactions = await prisma.transaction.findMany({
        where: { walletId: { in: [userId, receiverId, funderId] } },
      })
      console.log("Transactions before reconciliation:", transactions)

      jest.spyOn(lightningService, "checkInvoice").mockImplementation(async (invoiceId) => {
        console.log("Mock checkInvoice called with invoiceId:", invoiceId)
        return {
          is_confirmed: true,
          cltv_delta: 18,
          created_at: "2025-07-29T03:32:13.000Z",
          description: "",
          expires_at: "2025-07-29T06:32:13.000Z",
          id: invoiceId,
          index: 866,
          secret: "f85bdd893f63ac32c9ebb185a1b812888e9679642253bbc695226fb0d3b54352",
          tokens: 500,
          mtokens: "500000",
          payment: "86a6ab7dc830ce4c88ec9355bd1509e3e9530a96eb4720a9bb7044c58c4f1cc3",
          request:
            "lnbcrt5u1p5gss9app5vpxxlze6fthq6s445qsrcq3lnd7qv0zza6z9hrcjq0w4y7mtl0nsdqqcqpjxqr23ssp5s6n2klwgxr8yez8vjd2m69gfu054xz5kadrjp2dmwpzvtrz0rnps9qxpqysgqy20472ckgqwdk97n55f3xqvgdvu3yf8me6spadrh83txnl7fvqfjz6qa6pz875fh0p3u2ekvx6hqx7hzaxc55z0k3pfgu6k4k06cz4sqwvjj6s",
          features: [],
          payments: [],
          received: 500,
          received_mtokens: "500000",
          confirmed_at: "2025-07-29T03:32:13.000Z",
          confirmed_index: 522,
          is_private: false,
        }
      })

      const app = await initializeApp()
      const newServer = app.listen(0, () => {
        console.log("New test server started for reconciliation")
      })
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await new Promise<void>((resolve, reject) => {
        newServer.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })

      const updatedTransaction = await prisma.transaction.findFirst({
        where: { walletId: userId, amountInSats: 500, type: TransactionType.DEPOSIT },
      })
      console.log("Transaction state after restart:", updatedTransaction)
      expect(updatedTransaction!.walletImpacted).toBe(true)
      expect(updatedTransaction!.invoiceSettled).toBe(true)

      const wallet = await prisma.wallet.findUnique({ where: { userId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(29000 + 500) // 29500
    })

    it("should reconcile WITHDRAW: walletImpacted=true, invoiceSettled=false (confirmed)", async () => {
      const transactionsBefore = await prisma.transaction.findMany({
        where: { walletId: receiverId },
      })
      console.log("Transactions before test:", transactionsBefore)
      expect(transactionsBefore).toHaveLength(0)

      await fundWallet(receiverCookie, receiverId, 5000) // Sets receiver balance to 29000
      const walletCheck = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      expect(walletCheck?.balanceInSats).toBe(29000)

      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", cookie)
        .send({ amountInSats: 500 })
        .expect(201)

      const invoice = depositRes.body.invoice.request

      const withdrawRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/withdraw")
        .set("Cookie", receiverCookie)
        .send({ invoice })
        .expect(200)

      const withdrawTransactionId = withdrawRes.body.id

      await prisma.transaction.update({
        where: { id: withdrawTransactionId },
        data: { invoiceSettled: false, walletImpacted: true },
      })

      const initialTransaction = await prisma.transaction.findUnique({
        where: { id: withdrawTransactionId },
      })
      console.log("Initial transaction state:", initialTransaction)
      expect(initialTransaction!.walletImpacted).toBe(true)
      expect(initialTransaction!.invoiceSettled).toBe(false)
      expect(initialTransaction!.invoice).toHaveProperty("id")
      expect(initialTransaction!.invoice).toHaveProperty("request")

      const transactionsBeforeReconcile = await prisma.transaction.findMany({
        where: { walletId: receiverId },
      })
      console.log("Transactions before reconciliation:", transactionsBeforeReconcile)

      jest.spyOn(lightningService, "checkInvoice").mockImplementation((invoiceId) => {
        console.log(`Mock checkInvoice called with invoiceId: ${invoiceId}`)
        return Promise.resolve({ is_confirmed: true } as any)
      })

      await new Promise<void>((resolve) => {
        server.close(async () => {
          const app = await initializeApp()
          server = app.listen(process.env.SERVER_PORT || 2999, () => {
            setTimeout(resolve, 2000) // Increased delay
          })
        })
      })

      const transaction = await prisma.transaction.findUnique({
        where: { id: withdrawTransactionId },
      })
      console.log("Transaction state after restart:", transaction)
      expect(transaction!.walletImpacted).toBe(true)
      expect(transaction!.invoiceSettled).toBe(true)
      expect(transaction!.invoice).toHaveProperty("id")
      expect(transaction!.invoice).toHaveProperty("request")

      const wallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(29000 - 525) // 28475
    })

    it("should reconcile WITHDRAW: walletImpacted=true, invoiceSettled=false (not confirmed)", async () => {
      console.log(
        "Transactions before test:",
        await prisma.transaction.findMany({
          where: { walletId: { in: [userId, receiverId, funderId] } },
        })
      )

      await fundWallet(receiverCookie, receiverId, 5000) // Ensure initial balance is 29000
      const depositRes = await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/deposit")
        .set("Cookie", cookie)
        .send({ amountInSats: 500 })
        .expect(201)
      const depositInvoice = depositRes.body.invoice.request

      // Mock payInvoice to simulate an unconfirmed payment
      jest.spyOn(lightningService, "payInvoice").mockImplementation(async () => {
        throw new Error("Payment not confirmed")
      })

      await request(`http://localhost:${process.env.SERVER_PORT || 2999}`)
        .post("/v1/wallet/withdraw")
        .set("Cookie", receiverCookie)
        .send({ invoice: depositInvoice })
        .expect(400) // Expect failure due to mocked payInvoice

      // Manually create a transaction with inconsistent state since payInvoice fails
      const transaction = await prisma.transaction.create({
        data: {
          walletId: receiverId,
          amountInSats: 500,
          type: TransactionType.WITHDRAW,
          walletImpacted: true,
          invoiceSettled: false,
          invoice: {
            id: depositRes.body.invoice.id,
            request: depositInvoice,
          },
        },
      })

      console.log("Initial transaction state:", transaction)
      expect(transaction.walletImpacted).toBe(true)
      expect(transaction.invoiceSettled).toBe(false)

      // Check wallet balance after creating the transaction (should reflect deduction)
      const walletAfterDeduction = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      console.log("Wallet balance after withdrawal attempt:", walletAfterDeduction!.balanceInSats)
      expect(walletAfterDeduction!.balanceInSats).toBe(28475) // 29000 - (500 + 25 fee)

      const transactions = await prisma.transaction.findMany({
        where: { walletId: { in: [userId, receiverId, funderId] } },
      })
      console.log("Transactions before reconciliation:", transactions)

      // Mock checkInvoice to return unconfirmed
      jest.spyOn(lightningService, "checkInvoice").mockImplementation(async (invoiceId) => {
        console.log("Mock checkInvoice called with invoiceId:", invoiceId)
        return {
          is_confirmed: false,
          cltv_delta: 18,
          created_at: "2025-07-29T03:32:16.000Z",
          description: "",
          expires_at: "2025-07-29T06:32:16.000Z",
          id: invoiceId,
          index: 867,
          secret: "326ecc37645894c1f091b680c123fbecc029af10023c3b721c53c775bf1bf36b",
          tokens: 500,
          mtokens: "500000",
          request: depositInvoice,
          features: [],
          payments: [],
          received: 0,
          received_mtokens: "0",
          is_private: false,
        }
      })

      const app = await initializeApp()
      const newServer = app.listen(0, () => {
        console.log("New test server started for reconciliation")
      })
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await new Promise<void>((resolve, reject) => {
        newServer.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })

      const updatedTransaction = await prisma.transaction.findFirst({
        where: { walletId: receiverId, amountInSats: 500, type: TransactionType.WITHDRAW },
      })
      console.log("Transaction state after restart:", updatedTransaction)
      expect(updatedTransaction!.walletImpacted).toBe(false)
      expect(updatedTransaction!.invoiceSettled).toBe(false)

      const wallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(29525) // Reverted to 29000 + (500 + 25 fee)
    })

    it("should reconcile WITHDRAW: walletImpacted=false, invoiceSettled=true", async () => {
      console.log(
        "Transactions before test:",
        await prisma.transaction.findMany({
          where: { walletId: { in: [userId, receiverId, funderId] } },
        })
      )

      await fundWallet(receiverCookie, receiverId, 5000) // Ensure initial balance is 29000
      await prisma.transaction.create({
        data: {
          walletId: receiverId,
          amountInSats: 500,
          type: TransactionType.WITHDRAW,
          walletImpacted: false,
          invoiceSettled: true,
          invoice: {
            id: "test-invoice-id-6",
            request:
              "lnbcrt5u1p5gssxxpp53kau58nrnyrmyuvyapq8armg4lftwp0j03gq9mv5hzyp7agzj0csdqqcqpjxqr23ssp5s9009qjhr595rnkl6hfqz7khk97m30e60gvq3cltngcep0fycl4s9qxpqysgqnrzz7hnjyy0yeqlezngcy74n35jdc7xwen6h5pa9ra6q3dptjm7ynpsvmthhc86qjfr5n83rcx8j7l87z38uljv84uyhv56trjpw60cpwma53z",
            index: 871,
            secret: "93ff9d819e7ab78a0bd59090099a2a57244629d8dbe72f29f2e2d33f5de39720",
            tokens: 500,
            mtokens: "500000",
            payment: "7920e11306b1b476467df5118f4bf6e61a2e9450f8e83b62e69ae9e892425305",
            features: [],
            payments: [],
            received: 500,
            cltv_delta: 18,
            created_at: "2025-07-29T03:32:22.000Z",
            expires_at: "2025-07-29T06:32:22.000Z",
            is_private: false,
            description: "",
            confirmed_at: "2025-07-29T03:32:22.000Z",
            is_confirmed: true,
            confirmed_index: 527,
            received_mtokens: "500000",
          },
        },
      })

      const transaction = await prisma.transaction.findFirst({
        where: { walletId: receiverId, amountInSats: 500, type: TransactionType.WITHDRAW },
      })
      console.log("Initial transaction state:", transaction)

      const transactions = await prisma.transaction.findMany({
        where: { walletId: { in: [userId, receiverId, funderId] } },
      })
      console.log("Transactions before reconciliation:", transactions)

      jest.spyOn(lightningService, "checkInvoice").mockImplementation(async (invoiceId) => {
        console.log("Mock checkInvoice called with invoiceId:", invoiceId)
        return {
          is_confirmed: true,
          cltv_delta: 18,
          created_at: "2025-07-29T03:32:22.000Z",
          description: "",
          expires_at: "2025-07-29T06:32:22.000Z",
          id: invoiceId,
          index: 871,
          secret: "93ff9d819e7ab78a0bd59090099a2a57244629d8dbe72f29f2e2d33f5de39720",
          tokens: 500,
          mtokens: "500000",
          payment: "7920e11306b1b476467df5118f4bf6e61a2e9450f8e83b62e69ae9e892425305",
          request:
            "lnbcrt5u1p5gssxxpp53kau58nrnyrmyuvyapq8armg4lftwp0j03gq9mv5hzyp7agzj0csdqqcqpjxqr23ssp5s9009qjhr595rnkl6hfqz7khk97m30e60gvq3cltngcep0fycl4s9qxpqysgqnrzz7hnjyy0yeqlezngcy74n35jdc7xwen6h5pa9ra6q3dptjm7ynpsvmthhc86qjfr5n83rcx8j7l87z38uljv84uyhv56trjpw60cpwma53z",
          features: [],
          payments: [],
          received: 500,
          received_mtokens: "500000",
          confirmed_at: "2025-07-29T03:32:22.000Z",
          confirmed_index: 527,
          is_private: false,
        }
      })

      const app = await initializeApp()
      const newServer = app.listen(0, () => {
        console.log("New test server started for reconciliation")
      })
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await new Promise<void>((resolve, reject) => {
        newServer.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })

      const updatedTransaction = await prisma.transaction.findFirst({
        where: { walletId: receiverId, amountInSats: 500, type: TransactionType.WITHDRAW },
      })
      console.log("Transaction state after restart:", updatedTransaction)
      expect(updatedTransaction!.walletImpacted).toBe(true)
      expect(updatedTransaction!.invoiceSettled).toBe(true)

      const wallet = await prisma.wallet.findUnique({ where: { userId: receiverId } })
      console.log("Wallet balance after restart:", wallet!.balanceInSats)
      expect(wallet!.balanceInSats).toBe(29000 - 500 - 25) // 28475
    })
  })
})
