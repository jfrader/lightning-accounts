const { generateKeyPairSync, randomBytes } = require("node:crypto")

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})

Object.assign(process.env, {
  NODE_ENV: "production",
  NODE_ORIGIN: "https://web.build.invalid",
  NODE_HOST: "https://api.build.invalid",
  NODE_DOMAIN: ".build.invalid",
  NODE_PORT: "2999",
  NODE_TRUST_PROXY_HOPS: "0",
  WALLET_ENABLED: "0",
  APPLICATION_EMAILS: "service@build.invalid",
  DATABASE_URL:
    "postgresql://lightning_accounts_app:build-password@localhost:5432/lightning_accounts?schema=public&connection_limit=10&sslmode=require",
  JWT_SECRET: randomBytes(32).toString("hex"),
  JWT_BASE64_PUBLIC_KEY: Buffer.from(publicKey).toString("base64"),
  JWT_BASE64_PRIVATE_KEY: Buffer.from(privateKey).toString("base64"),
  SEED_HASH_SECRET: randomBytes(32).toString("hex"),
  SMTP_HOST: "smtp.build.invalid",
  SMTP_PORT: "587",
  SMTP_USERNAME: "build-smoke-user",
  SMTP_PASSWORD: randomBytes(32).toString("hex"),
  EMAIL_FROM: "Build Smoke <service@build.invalid>",
})

require("../build/src/app.js")
