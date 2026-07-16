import express from "express"
import request from "supertest"
import requestOrigin from "../../src/middlewares/requestOrigin"

const createApp = () => {
  const app = express()
  app.use(requestOrigin(["https://trusted.example"]))
  app.get("/resource", (_req, res) => res.sendStatus(204))
  app.post("/resource", (_req, res) => res.sendStatus(204))
  return app
}

describe("request origin middleware", () => {
  it("accepts unsafe requests from an allowed browser origin", async () => {
    await request(createApp())
      .post("/resource")
      .set("Origin", "https://trusted.example")
      .expect(204)
  })

  it("rejects unsafe requests from an untrusted browser origin", async () => {
    await request(createApp())
      .post("/resource")
      .set("Origin", "https://attacker.example")
      .expect(403)
  })

  it("allows server clients that do not send an Origin header", async () => {
    await request(createApp()).post("/resource").expect(204)
  })

  it("does not block safe requests", async () => {
    await request(createApp())
      .get("/resource")
      .set("Origin", "https://attacker.example")
      .expect(204)
  })
})
