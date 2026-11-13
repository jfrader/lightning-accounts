import express from "express"
import passport from "passport"
import request from "supertest"

jest.mock("passport", () => ({
  authenticate: jest.fn(),
}))

jest.mock("../../src/controllers", () => ({
  authController: new Proxy(
    {},
    {
      get: () => (_req: unknown, res: any) => {
        res.status(200).send()
      },
    }
  ),
}))

describe("auth X/Twitter routes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(passport.authenticate as jest.Mock).mockImplementation((strategy, options) => {
      return (_req: express.Request, res: express.Response) => {
        res.status(200).send({ strategy, scope: options?.scope })
      }
    })
  })

  it("initiates OAuth through the legacy Twitter route", async () => {
    const app = express()
    const authRoute = (await import("../../src/routes/v1/auth.route")).default
    app.use("/auth", authRoute)

    await request(app).get("/auth/twitter").expect(200).expect({
      strategy: "twitter",
    })
  })

  it("initiates OAuth through the X alias route", async () => {
    const app = express()
    const authRoute = (await import("../../src/routes/v1/auth.route")).default
    app.use("/auth", authRoute)

    await request(app)
      .get("/auth/x")
      .expect(200)
      .expect({
        strategy: "x",
        scope: ["tweet.read", "users.read", "offline.access"],
      })
  })

  it.each(["/magic-link/login", "/magic-link/register", "/login", "/forgot-password"])(
    "throttles recipient attempts before validation at %s",
    async (path) => {
      const app = express()
      const authRoute = (await import("../../src/routes/v1/auth.route")).default
      app.use(express.json())
      app.use("/auth", authRoute)
      const email = `${path.replace(/\//g, "-")}@invalid`
      for (let i = 0; i < 5; i++) {
        await request(app).post(`/auth${path}`).send({ email }).expect(400)
      }
      await request(app).post(`/auth${path}`).send({ email }).expect(429)
    }
  )
})
