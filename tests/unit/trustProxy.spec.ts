import express from "express"
import request from "supertest"
import { configureTrustProxy, resolveTrustProxySetting } from "../../src/config/trustProxy"

const createIpApp = (trustedHops: number, trustedProxyIps: string[] = []) => {
  const app = express()
  configureTrustProxy(app, trustedHops, trustedProxyIps)
  app.get("/ip", (req, res) => {
    res.send({ ip: req.ip, ips: req.ips })
  })
  return app
}

describe("Express trust proxy configuration", () => {
  it("ignores forwarded client IPs when no proxy is trusted", async () => {
    const response = await request(createIpApp(0))
      .get("/ip")
      .set("X-Forwarded-For", "198.51.100.10")
      .expect(200)

    expect(response.body.ip).not.toBe("198.51.100.10")
    expect(response.body.ips).toEqual([])
  })

  it("uses the forwarded client IP behind Render's single trusted hop", async () => {
    await request(createIpApp(1))
      .get("/ip")
      .set("X-Forwarded-For", "198.51.100.10")
      .expect(200)
      .expect({ ip: "198.51.100.10", ips: ["198.51.100.10"] })
  })

  it("preserves the explicit proxy IP allowlist fallback", () => {
    expect(resolveTrustProxySetting(0, ["10.0.0.0/8"])).toEqual(["loopback", "10.0.0.0/8"])
  })
})
