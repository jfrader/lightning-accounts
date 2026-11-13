import express from "express"
import request from "supertest"

const mockConfig = { env: "production", docsEnabled: false, wallet: { enabled: false } }
jest.mock("../../src/config/config", () => ({ __esModule: true, default: mockConfig }))
jest.mock("../../src/routes/v1/auth.route", () => ({ __esModule: true, default: express.Router() }))
jest.mock("../../src/routes/v1/user.route", () => ({ __esModule: true, default: express.Router() }))
jest.mock("../../src/routes/v1/wallet.route", () => ({
  __esModule: true,
  default: express.Router(),
}))
jest.mock("../../src/routes/v1/support.route", () => ({
  __esModule: true,
  default: express.Router(),
}))
jest.mock("../../src/routes/v1/docs.route", () => {
  const router = express.Router()
  router.get("/", (_req, res) => {
    res.sendStatus(200)
  })
  return { __esModule: true, default: router }
})
const mockAuth = jest.fn(
  (_permission: string) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.headers.authorization === "admin") next()
      else res.sendStatus(401)
    }
)
jest.mock("../../src/middlewares/auth", () => ({ __esModule: true, default: mockAuth }))

describe("production docs route", () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it("is absent by default", async () => {
    mockConfig.docsEnabled = false
    const router = (await import("../../src/routes/v1")).default
    const app = express().use("/v1", router)
    await request(app).get("/v1/docs").expect(404)
  })

  it("requires admin permission when explicitly enabled", async () => {
    mockConfig.docsEnabled = true
    const router = (await import("../../src/routes/v1")).default
    const app = express().use("/v1", router)
    await request(app).get("/v1/docs").expect(401)
    await request(app).get("/v1/docs").set("Authorization", "admin").expect(200)
    expect(mockAuth).toHaveBeenCalledWith("users_write")
  })
})
