import { generateKeyPairSync } from "node:crypto"

describe("resolveXOAuthConfig", () => {
  const originalEnv = process.env
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  })

  const configureValidProductionEnvironment = () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      NODE_ORIGIN: "https://trucoshi.com",
      NODE_DOMAIN: ".trucoshi.com",
      NODE_HOST: "https://accounts.trucoshi.com",
      NODE_TRUST_PROXY_HOPS: "1",
      APPLICATION_EMAILS: "game@trucoshi.com",
      DATABASE_URL: "postgresql://user:password@database.internal:5432/accounts",
      JWT_SECRET: "a-secure-cookie-secret-with-more-than-32-characters",
      JWT_BASE64_PUBLIC_KEY: Buffer.from(publicKey).toString("base64"),
      JWT_BASE64_PRIVATE_KEY: Buffer.from(privateKey).toString("base64"),
      SEED_HASH_SECRET: "a-secure-seed-hash-secret-more-than-32-characters",
      SMTP_HOST: "smtp.example.net",
      SMTP_PORT: "587",
      SMTP_USERNAME: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      EMAIL_FROM: "support@trucoshi.com",
      WALLET_ENABLED: "0",
    })
  }

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
      const { resolveWalletEnabled } = await import("../../src/config/config")

      expect(resolveWalletEnabled({ NODE_ENV: environment })).toBe(true)
    }
  )

  it("keeps wallets disabled by default in production", async () => {
    const { resolveWalletEnabled } = await import("../../src/config/config")

    expect(resolveWalletEnabled({ NODE_ENV: "production" })).toBe(false)
  })

  it("accepts a complete production configuration with wallets disabled", async () => {
    configureValidProductionEnvironment()
    const { default: config } = await import("../../src/config/config")

    expect(config.wallet.enabled).toBe(false)
  })

  it("rejects placeholder secrets and non-HTTPS origins in production", async () => {
    const { getProductionEnvironmentErrors } = await import("../../src/config/config")
    const environment = {
      NODE_ENV: "production",
      NODE_ORIGIN: "http://trucoshi.com",
      NODE_HOST: "https://accounts.trucoshi.com",
      NODE_DOMAIN: ".trucoshi.com",
      DATABASE_URL: "postgresql://user:password@database.internal:5432/accounts",
      APPLICATION_EMAILS: "admin@example.com",
      JWT_SECRET: "replace-with-a-long-random-cookie-signing-secret",
      JWT_BASE64_PUBLIC_KEY: "invalid",
      JWT_BASE64_PRIVATE_KEY: "invalid",
      SEED_HASH_SECRET: "replace-with-a-long-random-secret",
      NODE_TRUST_PROXY_HOPS: "1",
      SMTP_HOST: "smtp.example.net",
      SMTP_PORT: "587",
      SMTP_USERNAME: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      EMAIL_FROM: "support@trucoshi.com",
      WALLET_ENABLED: "0",
    }

    expect(getProductionEnvironmentErrors(environment)).toEqual(
      expect.arrayContaining([
        "NODE_ORIGIN must be an exact HTTPS origin",
        "APPLICATION_EMAILS must contain valid non-placeholder service-account emails",
        "JWT_SECRET must be a non-placeholder secret of at least 32 characters",
        "SEED_HASH_SECRET must be a non-placeholder secret of at least 32 characters",
        "JWT_BASE64_PUBLIC_KEY and JWT_BASE64_PRIVATE_KEY must be valid RSA keys",
      ])
    )
  })
})
