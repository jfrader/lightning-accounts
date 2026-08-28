import express from "express"
import request from "supertest"
import { noIndexHeader, robotsTxt } from "../../src/middlewares/robots"

const createApp = () => {
  const app = express()
  app.use(noIndexHeader)
  app.get("/robots.txt", robotsTxt)
  app.get("/v1/ping", (_req, res) => res.sendStatus(204))
  return app
}

describe("robots", () => {
  it("serves a disallow-all robots.txt", async () => {
    const res = await request(createApp()).get("/robots.txt").expect(200)
    expect(res.text).toBe("User-agent: *\nDisallow: /\n")
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow")
  })

  it("sends X-Robots-Tag on other routes", async () => {
    const res = await request(createApp()).get("/v1/ping").expect(204)
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow")
  })
})
