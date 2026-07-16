import dotenv from "dotenv"
import path from "path"
import Joi from "joi"

dotenv.config({ path: path.join(process.cwd(), ".env") })

const envVarsSchema = Joi.object()
  .keys({
    WALLET_ENABLED: Joi.string()
      .valid("0", "1")
      .description("Enable Lightning wallet and payment functionality"),
    WALLET_LIMIT: Joi.number()
      .integer()
      .min(0)
      .max(2_147_483_647)
      .default(0)
      .description("Maximum allowed sats per wallet; 0 uses the database integer limit"),
    WALLET_RECONCILE_DRY_RUN: Joi.string().description("Dry run reconciliation on startup"),
    NODE_ENV: Joi.string().valid("production", "development", "test").required(),
    PORT: Joi.number().description("Platform-provided HTTP port"),
    NODE_PORT: Joi.number().default(3000),
    NODE_ORIGIN: Joi.string().required().description("Allowed origin"),
    NODE_DOMAIN: Joi.string()
      .empty("")
      .default("")
      .description("The domain for cookie like '.example.com'"),
    NODE_HOST: Joi.string().description("The host URL of the API for twitter.strategy"),
    NODE_TRUST_PROXY_HOPS: Joi.number()
      .integer()
      .min(0)
      .default(0)
      .description("Number of trusted reverse-proxy hops"),
    NODE_TRUSTED_PROXY_IP: Joi.string()
      .empty("")
      .default("")
      .description(
        "Comma-separated proxy IPs/CIDRs for Express trust proxy (e.g. 127.0.0.1,10.0.0.0/8)"
      ),
    NODE_DEBUG_LEVEL: Joi.string().description(
      "Debug level (trace, debug, info, warning, error, fatal)"
    ),
    APPLICATION_EMAILS: Joi.string()
      .empty("")
      .default("")
      .description("Comma-separated application service-account email allowlist"),
    APPLICATION_ADDRESS: Joi.string()
      .empty("")
      .default("")
      .description("Optional additional source address for allowlisted applications"),
    TWITTER_CLIENT_ID: Joi.string().empty("").description("Twitter developer client ID"),
    TWITTER_CLIENT_SECRET: Joi.string().empty("").description("Twitter developer client secret"),
    TWITTER_CLIENT_TYPE: Joi.string()
      .empty("")
      .description("Twitter developer client type (confidential, private, public)"),
    TWITTER_API_KEY: Joi.string().empty("").description("Legacy Twitter/X OAuth 1.0a API key"),
    TWITTER_API_SECRET: Joi.string().empty("").description("Twitter/X OAuth 1.0a API secret"),
    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_COOKIE_PREFIX: Joi.string().allow("").default(""),
    JWT_BASE64_PUBLIC_KEY: Joi.string().required().description("Base64 encoded public key"),
    JWT_BASE64_PRIVATE_KEY: Joi.string().required().description("Base64 encoded private key"),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .min(5)
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .min(1)
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    JWT_MAGIC_LINK_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which magic login links expire"),
    BCRYPT_ROUNDS: Joi.number()
      .integer()
      .min(10)
      .max(15)
      .default(12)
      .description("bcrypt work factor for newly hashed credentials"),
    SMTP_HOST: Joi.string().description("server that will send the emails"),
    SMTP_PORT: Joi.number().description("port to connect to the email server"),
    SMTP_USERNAME: Joi.string().description("username for email server"),
    SMTP_PASSWORD: Joi.string().description("password for email server"),
    EMAIL_FROM: Joi.string().description("the from field in the emails sent by the app"),
    LND_CERT: Joi.string().description("LND tls.cert encoded in base64"),
    LND_ADMIN_MACAROON: Joi.string().description("LND admin.macaroon encoded in base64"),
    LND_SOCKET: Joi.string().description("LND host socket"),
    SEED_HASH_SECRET: Joi.string().required().description("Secret key for hashing seed phrases"),
  })
  .unknown()

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env)

if (error) {
  throw new Error(`Config validation error: ${error.message}`)
}

const origins = String(envVars.NODE_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => (origin === "*" ? origin : new URL(origin).origin))

if (envVars.NODE_ENV === "production" && origins.includes("*")) {
  throw new Error("Config validation error: NODE_ORIGIN cannot contain '*' in production")
}

export const resolveXOAuthConfig = (env: Record<string, string | undefined>) => ({
  clientID: env.TWITTER_CLIENT_ID,
  clientSecret: env.TWITTER_CLIENT_SECRET,
  clientType: env.TWITTER_CLIENT_TYPE,
})

export const resolveXOAuth1Config = (env: Record<string, string | undefined>) => ({
  apiKey: env.TWITTER_API_KEY,
  apiSecret: env.TWITTER_API_SECRET,
})

export default {
  env: envVars.NODE_ENV,
  port: envVars.PORT ?? envVars.NODE_PORT,
  origin: origins[0],
  origins,
  host: envVars.NODE_HOST,
  domain: envVars.NODE_DOMAIN,
  trustProxyHops: envVars.NODE_TRUST_PROXY_HOPS,
  trustedProxyIps: envVars.NODE_TRUSTED_PROXY_IP
    ? envVars.NODE_TRUSTED_PROXY_IP.split(",").map((ip: string) => ip.trim())
    : [],
  debug_level: envVars.NODE_DEBUG_LEVEL,
  application: {
    address: envVars.APPLICATION_ADDRESS,
    emails: envVars.APPLICATION_EMAILS
      ? envVars.APPLICATION_EMAILS.split(",")
          .map((email: string) => email.trim())
          .filter(Boolean)
      : [],
  },
  twitter: {
    ...resolveXOAuthConfig(envVars),
    ...resolveXOAuth1Config(envVars),
  },
  wallet: {
    enabled:
      envVars.WALLET_ENABLED === "1" ||
      (!process.env.WALLET_ENABLED && envVars.NODE_ENV !== "production"),
    limit: Number(envVars.WALLET_LIMIT),
    reconcileDryRun: process.env.WALLET_RECONCILE_DRY_RUN === "1",
  },
  jwt: {
    prefix: envVars.JWT_COOKIE_PREFIX || "",
    secret: envVars.JWT_SECRET,
    publicKey: Buffer.from(envVars.JWT_BASE64_PUBLIC_KEY || "", "base64").toString(),
    privateKey: Buffer.from(envVars.JWT_BASE64_PRIVATE_KEY || "", "base64").toString(),
    accessExpirationMinutes: Number(envVars.JWT_ACCESS_EXPIRATION_MINUTES),
    refreshExpirationDays: Number(envVars.JWT_REFRESH_EXPIRATION_DAYS),
    resetPasswordExpirationMinutes: Number(envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES),
    verifyEmailExpirationMinutes: Number(envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES),
    magicLinkExpirationMinutes: Number(envVars.JWT_MAGIC_LINK_EXPIRATION_MINUTES),
  },
  bcryptRounds: Number(envVars.BCRYPT_ROUNDS),
  lnurl: {
    host: envVars.LNURL_HOST,
    port: envVars.LNURL_PORT,
  },
  lightning: {
    driver: "lnd",
    lndConfig: {
      cert: envVars.LND_CERT,
      macaroon: envVars.LND_ADMIN_MACAROON,
      socket: envVars.LND_SOCKET,
    },
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  seedHashSecret: envVars.SEED_HASH_SECRET,
}
