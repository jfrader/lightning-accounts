describe("resolveXOAuthConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      NODE_ORIGIN: "http://localhost:3000",
      JWT_SECRET: "secret",
      JWT_BASE64_PUBLIC_KEY: Buffer.from("public").toString("base64"),
      JWT_BASE64_PRIVATE_KEY: Buffer.from("private").toString("base64"),
      SEED_HASH_SECRET: "seed-secret",
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("reads OAuth 2.0 credentials from Twitter env vars", async () => {
    const { resolveXOAuthConfig } = await import("../../src/config/config")

    expect(
      resolveXOAuthConfig({
        TWITTER_CLIENT_ID: "twitter-client",
        TWITTER_CLIENT_SECRET: "twitter-secret",
        TWITTER_CLIENT_TYPE: "public",
      })
    ).toEqual({
      clientID: "twitter-client",
      clientSecret: "twitter-secret",
      clientType: "public",
    })
  })

  it("reads OAuth 1.0a API key credentials from Twitter env vars", async () => {
    const { resolveXOAuth1Config } = await import("../../src/config/config")

    expect(
      resolveXOAuth1Config({
        TWITTER_API_KEY: "twitter-api-key",
        TWITTER_API_SECRET: "twitter-api-secret",
      })
    ).toEqual({
      apiKey: "twitter-api-key",
      apiSecret: "twitter-api-secret",
    })
  })

  it("prefers Render's PORT over NODE_PORT", async () => {
    process.env.PORT = "10000"
    process.env.NODE_PORT = "2999"
    const { default: config } = await import("../../src/config/config")

    expect(config.port).toBe(10000)
  })

  it("does not trust proxy hops by default", async () => {
    delete process.env.NODE_TRUST_PROXY_HOPS
    const { default: config } = await import("../../src/config/config")

    expect(config.trustProxyHops).toBe(0)
  })

  it("reads an explicit trusted proxy hop count", async () => {
    process.env.NODE_TRUST_PROXY_HOPS = "1"
    const { default: config } = await import("../../src/config/config")

    expect(config.trustProxyHops).toBe(1)
  })

  it("parses the application email allowlist", async () => {
    process.env.APPLICATION_EMAILS = " game@example.com,admin@example.com "
    const { default: config } = await import("../../src/config/config")

    expect(config.application.emails).toEqual(["game@example.com", "admin@example.com"])
  })

  it.each(["test", "development"] as const)(
    "keeps wallets enabled by default in %s",
    async (environment) => {
      delete process.env.WALLET_ENABLED
      process.env.NODE_ENV = environment
      const { default: config } = await import("../../src/config/config")

      expect(config.wallet.enabled).toBe(true)
    }
  )

  it("keeps wallets disabled by default in production", async () => {
    delete process.env.WALLET_ENABLED
    process.env.NODE_ENV = "production"
    const { default: config } = await import("../../src/config/config")

    expect(config.wallet.enabled).toBe(false)
  })
})
