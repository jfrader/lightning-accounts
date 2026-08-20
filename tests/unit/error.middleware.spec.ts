import express from "express"
import { Prisma } from "@prisma/client"
import request from "supertest"
import config from "../../src/config/config"
import { captureRouteBase, errorConverter, errorHandler } from "../../src/middlewares/error"
import { observability } from "../../src/observability"
import ApiError from "../../src/utils/ApiError"

describe("production error middleware", () => {
  const originalEnvironment = config.env

  beforeEach(() => {
    config.env = "production"
  })

  afterEach(() => {
    config.env = originalEnvironment
  })

  it("preserves an existing numeric 4xx status as operational", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const app = express()
    app.get("/forbidden", (_req, _res, next) => {
      next(Object.assign(new Error("forbidden"), { statusCode: 403 }))
    })
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app).get("/forbidden").expect(403).expect({ code: 403, message: "forbidden" })
    expect(captureException).not.toHaveBeenCalled()
  })

  it("returns malformed JSON as an operational 400 without reporting it", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const app = express()
    app.use(express.json())
    app.post("/payload", (_req, res) => res.sendStatus(204))
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app)
      .post("/payload")
      .set("Content-Type", "application/json")
      .send('{"password":"not-for-sentry"')
      .expect(400)
      .expect({ code: 400, message: "Bad Request" })
    expect(captureException).not.toHaveBeenCalled()
  })

  it("returns expected Prisma constraint failures as operational 400 errors", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const app = express()
    app.post("/users", (_req, _res, next) => {
      next(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        })
      )
    })
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app).post("/users").expect(400).expect({ code: 400, message: "Bad Request" })
    expect(captureException).not.toHaveBeenCalled()
  })

  it.each(["P2021", "P2024", "P2037"])(
    "reports internal Prisma failure %s as a 500 error",
    async (code) => {
      const captureException = jest
        .spyOn(observability, "captureException")
        .mockImplementation(() => undefined)
      const app = express()
      app.get("/users", (_req, _res, next) => {
        next(
          new Prisma.PrismaClientKnownRequestError("Internal database failure", {
            code,
            clientVersion: "test",
          })
        )
      })
      app.use(errorConverter)
      app.use(errorHandler)

      await request(app)
        .get("/users")
        .expect(500)
        .expect({ code: 500, message: "Internal Server Error" })
      expect(captureException).toHaveBeenCalledTimes(1)
      expect(captureException).toHaveBeenCalledWith(expect.any(ApiError), expect.any(Object))
    }
  )

  it("reports a final 5xx with a nested route template and no request data", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const usersRouter = express.Router()
    const v1Router = express.Router()
    const app = express()
    usersRouter.post("/:userId", (_req, _res, next) => next(new Error("failure")))
    v1Router.use("/users", captureRouteBase("/users"), usersRouter)
    app.use("/v1", captureRouteBase("/v1"), v1Router)
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app)
      .post("/v1/users/private-user-id?token=not-for-sentry")
      .set("Authorization", "Bearer not-for-sentry")
      .send({ password: "not-for-sentry" })
      .expect(500)
      .expect({ code: 500, message: "Internal Server Error" })

    expect(captureException).toHaveBeenCalledTimes(1)
    const [capturedError, context] = captureException.mock.calls[0]
    expect(capturedError).toBeInstanceOf(ApiError)
    expect(context).toEqual({
      tags: { method: "POST", path: "/v1/users/:userId" },
      extra: { reqId: undefined, statusCode: 500 },
    })
    expect(JSON.stringify(context)).not.toContain("private-user-id")
    expect(JSON.stringify(context)).not.toContain("not-for-sentry")
  })

  it("keeps parameters in nested router prefixes as templates", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const organizationRouter = express.Router({ mergeParams: true })
    const v1Router = express.Router()
    const app = express()
    organizationRouter.get("/users/:userId", (_req, _res, next) => next(new Error("failure")))
    v1Router.use(
      "/organizations/:organizationId",
      captureRouteBase("/organizations/:organizationId"),
      organizationRouter
    )
    app.use("/v1", captureRouteBase("/v1"), v1Router)
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app).get("/v1/organizations/private-organization/users/private-user").expect(500)

    expect(captureException).toHaveBeenCalledWith(expect.any(ApiError), {
      tags: {
        method: "GET",
        path: "/v1/organizations/:organizationId/users/:userId",
      },
      extra: { reqId: undefined, statusCode: 500 },
    })
    expect(JSON.stringify(captureException.mock.calls[0])).not.toContain("private-organization")
    expect(JSON.stringify(captureException.mock.calls[0])).not.toContain("private-user")
  })

  it("uses a static fallback when no matched route template is available", async () => {
    const captureException = jest
      .spyOn(observability, "captureException")
      .mockImplementation(() => undefined)
    const app = express()
    app.use((_req, _res, next) => next(new Error("failure")))
    app.use(errorConverter)
    app.use(errorHandler)

    await request(app).get("/private-user-id?token=not-for-sentry").expect(500)

    expect(captureException).toHaveBeenCalledWith(expect.any(ApiError), {
      tags: { method: "GET", path: "/unmatched" },
      extra: { reqId: undefined, statusCode: 500 },
    })
  })
})
