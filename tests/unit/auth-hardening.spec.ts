import express from "express"
import request from "supertest"
import { createHash } from "node:crypto"
import { createRequest } from "node-mocks-http"
import {
  authLimiter,
  keyGenerator,
  recipientLimiter,
  recipientKeyGenerator,
} from "../../src/middlewares/rateLimiter"
import { redactRequestUrl, successHandler, errorHandler } from "../../src/config/morgan"
import logger from "../../src/config/logger"
import { getSeedCredentials } from "../../prisma/seed"

describe("authentication request limits", () => {
  it("uses IP rather than arbitrary access cookies", () => {
    const req = createRequest({ ip: "198.51.100.1", cookies: { access: "attacker-one" } })
    const key = keyGenerator(req)
    req.cookies.access = "attacker-two"
    expect(keyGenerator(req)).toBe(key)
    expect(key).toBe("198.51.100.1")
  })

  it("counts failed requests even when the cookie changes", async () => {
    const app = express()
    app.post("/login", authLimiter, (_req, res) => {
      res.sendStatus(401)
    })
    for (let i = 0; i < 50; i++) {
      await request(app).post("/login").set("Cookie", `access=random-${i}`).expect(401)
    }
    await request(app).post("/login").set("Cookie", "access=new").expect(429)
  })

  it("shares a normalized-recipient bucket across IPs and endpoints, including failures", async () => {
    const app = express()
    app.set("trust proxy", 1)
    app.use(express.json())
    app.post(["/magic-link/login", "/forgot-password", "/login"], recipientLimiter, (_req, res) => {
      res.sendStatus(400)
    })
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/magic-link/login")
        .set("X-Forwarded-For", `198.51.100.${i + 1}`)
        .send({ email: "  Player@Example.COM " })
        .expect(400)
    }
    await request(app)
      .post("/forgot-password")
      .set("X-Forwarded-For", "203.0.113.1")
      .send({ email: "player@example.com" })
      .expect(429)
    await request(app).post("/login").send({ email: "another@example.com" }).expect(400)
    expect(
      recipientKeyGenerator({ body: { email: " Player@Example.COM " } } as express.Request)
    ).toBe(createHash("sha256").update("player@example.com").digest("hex"))
  })
})

describe("access log credentials", () => {
  it.each([
    "/v1/auth/magic-link/consume?token=secret&next=%2Fwallet",
    "/v1/auth/reset-password?token=secret#credential",
    "/v1/auth/login?password=secret&access_token=secret",
  ])("removes every query value from %s", (url) => {
    expect(redactRequestUrl(url)).toBe(url.split("?")[0])
  })

  it("never writes magic-link URLs or error credentials to either log stream", async () => {
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger)
    const error = jest.spyOn(logger, "error").mockImplementation(() => logger)
    const app = express()
    app.use(successHandler, errorHandler)
    app.get("/link", (req, res) => {
      res.locals.errorMessage = "secret-error-token"
      res.sendStatus(req.query.fail ? 400 : 200)
    })
    await request(app).get("/link?token=secret-token").expect(200)
    await request(app).get("/link?token=secret-token&fail=1").expect(400)
    expect(info).toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    for (const call of [...info.mock.calls, ...error.mock.calls]) {
      expect(String(call[0])).not.toContain("secret")
      expect(String(call[0])).not.toContain("?token")
    }
  })
})

describe("seed safety", () => {
  const credentials = {
    SEED_APP_EMAIL: "app@example.com",
    SEED_APP_PASSWORD: "app-secret",
    SEED_ADMIN_EMAIL: "admin@example.com",
    SEED_ADMIN_PASSWORD: "admin-secret",
    SEED_E2E_PASSWORD: "e2e-secret",
  }
  it.each(["production", "testnet", undefined])("refuses seeding in %s", (NODE_ENV) => {
    expect(() => getSeedCredentials({ ...credentials, NODE_ENV })).toThrow("development/test")
  })
  it.each(Object.keys(credentials))("requires explicit %s", (name) => {
    expect(() => getSeedCredentials({ ...credentials, NODE_ENV: "test", [name]: "" })).toThrow(name)
  })
  it("accepts explicit local credentials", () => {
    expect(getSeedCredentials({ ...credentials, NODE_ENV: "development" }).adminPassword).toBe(
      "admin-secret"
    )
  })
})
