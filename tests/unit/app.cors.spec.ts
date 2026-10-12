import request from "supertest"
import app from "../../src/app"
import { authLimiter } from "../../src/middlewares/rateLimiter"
import { getCookieName } from "../../src/utils/authCookie"
import { JwtCookie } from "../../src/types/tokens"

jest.mock("nostr-tools", () => ({ nip98: {} }))

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: {
    ...jest.requireActual("../../src/config/config").default,
    origins: ["https://trusted.example"],
    trustedProxyIps: [],
  },
}))

jest.mock("../../src/routes/v1", () => {
  const express = jest.requireActual<typeof import("express")>("express")
  const { authLimiter } = jest.requireActual<typeof import("../../src/middlewares/rateLimiter")>(
    "../../src/middlewares/rateLimiter"
  )
  return {
    __esModule: true,
    default: express.Router().get("/auth/profile", authLimiter, (_req, res) => {
      res.sendStatus(204)
    }),
  }
})

describe("app CORS rate-limit headers", () => {
  const allowedOrigin = "https://trusted.example"
  const deniedOrigin = "https://attacker.example"
  const limiterKey = "cors-rate-limit-test"
  const cookie = `${getCookieName(JwtCookie.access)}=${limiterKey}`

  beforeEach(() => {
    authLimiter.resetKey(limiterKey)
  })

  afterAll(() => {
    authLimiter.resetKey(limiterKey)
  })

  const exhaustLimit = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await request(app)
        .get("/v1/auth/profile")
        .set("Origin", allowedOrigin)
        .set("Cookie", cookie)
        .expect(204)
    }
  }

  it("exposes the actual Retry-After header to an allowed credentialed origin on 429", async () => {
    await exhaustLimit()

    const response = await request(app)
      .get("/v1/auth/profile")
      .set("Origin", allowedOrigin)
      .set("Cookie", cookie)
      .expect(429)

    expect(response.body).toEqual({ message: "Too many requests, please try again later." })
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0)
    expect(Number(response.headers["retry-after"])).toBeLessThanOrEqual(300)
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin)
    expect(response.headers["access-control-allow-credentials"]).toBe("true")
    expect(response.headers["access-control-expose-headers"]).toBe("Retry-After")
  })

  it("keeps rate-limited responses unreadable to an unauthorized origin", async () => {
    await exhaustLimit()

    const response = await request(app)
      .get("/v1/auth/profile")
      .set("Origin", deniedOrigin)
      .set("Cookie", cookie)
      .expect(429)

    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0)
    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("preserves credentialed preflight with explicit request and exposed response headers", async () => {
    const response = await request(app)
      .options("/v1/auth/profile")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization,Content-Type")
      .expect(204)

    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin)
    expect(response.headers["access-control-allow-credentials"]).toBe("true")
    expect(response.headers["access-control-allow-headers"]).toBe("Content-Type,Authorization")
    expect(response.headers["access-control-expose-headers"]).toBe("Retry-After")
  })

  it("keeps unauthorized preflight unreadable", async () => {
    const response = await request(app)
      .options("/v1/auth/profile")
      .set("Origin", deniedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization")
      .expect(204)

    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("still rejects unsafe requests from an unauthorized origin", async () => {
    const response = await request(app)
      .post("/v1/auth/profile")
      .set("Origin", deniedOrigin)
      .set("Cookie", cookie)
      .expect(403)

    expect(response.headers["access-control-allow-origin"]).toBeUndefined()
  })
})
