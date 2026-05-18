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

  it("prefers X env vars over legacy Twitter env vars", async () => {
    const { resolveXOAuthConfig } = await import("../../src/config/config")

    expect(
      resolveXOAuthConfig({
        X_CLIENT_ID: "x-client",
        X_CLIENT_SECRET: "x-secret",
        X_CLIENT_TYPE: "confidential",
        TWITTER_CLIENT_ID: "twitter-client",
        TWITTER_CLIENT_SECRET: "twitter-secret",
        TWITTER_CLIENT_TYPE: "public",
      })
    ).toEqual({
      clientID: "x-client",
      clientSecret: "x-secret",
      clientType: "confidential",
    })
  })

  it("falls back to legacy Twitter env vars", async () => {
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
})
