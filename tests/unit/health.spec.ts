import express from "express"
import request from "supertest"
import { version as packageVersion } from "../../package.json"
import config from "../../src/config/config"
import healthRoutes, { setReady } from "../../src/health"

describe("health routes", () => {
  const app = express().use("/health", healthRoutes)
  const originalRenderGitCommit = process.env.RENDER_GIT_COMMIT
  const originalWalletEnabled = config.wallet.enabled

  beforeEach(() => {
    delete process.env.RENDER_GIT_COMMIT
    config.wallet.enabled = false
    setReady(false)
  })

  afterAll(() => {
    if (originalRenderGitCommit === undefined) {
      delete process.env.RENDER_GIT_COMMIT
    } else {
      process.env.RENDER_GIT_COMMIT = originalRenderGitCommit
    }
    config.wallet.enabled = originalWalletEnabled
  })

  it("reports the process as live regardless of readiness", async () => {
    await request(app).get("/health/live").expect(200).expect({
      status: "ok",
      version: packageVersion,
      walletEnabled: false,
    })
  })

  it("reports unavailable until initialization finishes", async () => {
    await request(app).get("/health/ready").expect(503).expect({
      status: "not_ready",
      version: packageVersion,
      walletEnabled: false,
    })
  })

  it("reports ready after the database connection succeeds", async () => {
    setReady(true)

    await request(app).get("/health/ready").expect(200).expect({
      status: "ready",
      version: packageVersion,
      walletEnabled: false,
    })
  })

  it("reports the Render commit and enabled wallet state when configured", async () => {
    process.env.RENDER_GIT_COMMIT = "render-commit-sha"
    config.wallet.enabled = true

    await request(app).get("/health/live").expect(200).expect({
      status: "ok",
      version: "render-commit-sha",
      walletEnabled: true,
    })
  })
})
