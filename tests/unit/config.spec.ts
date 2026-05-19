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
})
