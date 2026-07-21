import dotenv from "dotenv"
import path from "path"
import Joi from "joi"
import { createPrivateKey, createPublicKey } from "node:crypto"
import addressparser from "nodemailer/lib/addressparser"
import { getDatabaseTargetErrors } from "./databaseTarget"

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

const PLACEHOLDER_PATTERN =
  /(?:change me|replace[- ]with|base64[- ]encoded|example\.com|placeholder|local[- ]dev|not[- ]for[- ]production)/i

const valueOf = (environment: NodeJS.ProcessEnv, key: string) => environment[key]?.trim() || ""

const validateHttpsOrigin = (key: string, value: string, errors: string[]): URL | undefined => {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href !== `${url.origin}/`
    ) {
      errors.push(`${key} must be an exact HTTPS origin`)
      return undefined
    }
    return url
  } catch {
    errors.push(`${key} must be an exact HTTPS origin`)
    return undefined
  }
}

const requireStrongSecret = (key: string, value: string, errors: string[]) => {
  if (value.length < 32 || PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${key} must be a non-placeholder secret of at least 32 characters`)
  }
}

const EMAIL_ADDRESS_SCHEMA = Joi.string().email({ tlds: false }).required()

const isValidDisplayName = (name: string): boolean => {
  const value = name.trim()
  if (!value || /[\u0000-\u001f\u007f<>]/u.test(value)) return false

  if (value.startsWith('"') || value.endsWith('"')) {
    return /^"(?:[^"\\\r\n]|\\[^\r\n])+"$/u.test(value)
  }

  return (
    !value.includes('"') && !value.includes("\\") && !value.includes(":") && !value.includes(";")
  )
}

export const isValidEmailFrom = (input: string): boolean => {
  const value = input.trim()
  if (!value || /[\u0000-\u001f\u007f]/u.test(value)) return false

  let parsed: ReturnType<typeof addressparser>
  try {
    parsed = addressparser(value)
  } catch {
    return false
  }

  if (parsed.length !== 1 || !("address" in parsed[0])) return false

  const mailbox = parsed[0]
  if (EMAIL_ADDRESS_SCHEMA.validate(mailbox.address).error) return false
  if (value === mailbox.address) return true

  const displayMailbox = value.match(/^(.+?)\s*<([^<>]+)>$/u)
  if (!displayMailbox) return false

  const [, displayName, address] = displayMailbox
  return address.trim() === mailbox.address && isValidDisplayName(displayName)
}

export const getProductionEnvironmentErrors = (
  environment: NodeJS.ProcessEnv = process.env
): string[] => {
  if (environment.NODE_ENV !== "production") return []

  const errors: string[] = []
  const originValues = valueOf(environment, "NODE_ORIGIN")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (!originValues.length) {
    errors.push("NODE_ORIGIN must contain at least one exact HTTPS origin")
  } else {
    originValues.forEach((origin) => validateHttpsOrigin("NODE_ORIGIN", origin, errors))
  }

  const nodeHost = validateHttpsOrigin("NODE_HOST", valueOf(environment, "NODE_HOST"), errors)
  const cookieDomain = valueOf(environment, "NODE_DOMAIN")
  if (
    !cookieDomain.startsWith(".") ||
    cookieDomain.length < 4 ||
    cookieDomain.includes("/") ||
    (nodeHost && !nodeHost.hostname.endsWith(cookieDomain))
  ) {
    errors.push("NODE_DOMAIN must be a parent cookie domain for NODE_HOST")
  }

  errors.push(
    ...getDatabaseTargetErrors(
      valueOf(environment, "DATABASE_URL"),
      "public",
      "lightning_accounts",
      "lightning_accounts_app",
      10,
      "require"
    )
  )

  const applicationEmails = valueOf(environment, "APPLICATION_EMAILS")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
  if (
    !applicationEmails.length ||
    applicationEmails.some(
      (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || PLACEHOLDER_PATTERN.test(email)
    )
  ) {
    errors.push("APPLICATION_EMAILS must contain valid non-placeholder service-account emails")
  }

  requireStrongSecret("JWT_SECRET", valueOf(environment, "JWT_SECRET"), errors)
  requireStrongSecret("SEED_HASH_SECRET", valueOf(environment, "SEED_HASH_SECRET"), errors)

  try {
    const privateKey = createPrivateKey(
      Buffer.from(valueOf(environment, "JWT_BASE64_PRIVATE_KEY"), "base64").toString("utf8")
    )
    const publicKey = createPublicKey(
      Buffer.from(valueOf(environment, "JWT_BASE64_PUBLIC_KEY"), "base64").toString("utf8")
    )
    if (
      privateKey.asymmetricKeyType !== "rsa" ||
      publicKey.asymmetricKeyType !== "rsa" ||
      (privateKey.asymmetricKeyDetails?.modulusLength || 0) < 2048
    ) {
      throw new Error("RSA key pair is too weak")
    }
    const configuredPublicKey = publicKey.export({ type: "spki", format: "der" })
    const derivedPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" })
    if (!configuredPublicKey.equals(derivedPublicKey)) {
      errors.push("JWT_BASE64_PUBLIC_KEY and JWT_BASE64_PRIVATE_KEY must be a matching key pair")
    }
  } catch {
    errors.push("JWT_BASE64_PUBLIC_KEY and JWT_BASE64_PRIVATE_KEY must be valid RSA keys")
  }

  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "EMAIL_FROM"]) {
    if (!valueOf(environment, key) || PLACEHOLDER_PATTERN.test(valueOf(environment, key))) {
      errors.push(`${key} must be configured for production email flows`)
    }
  }
  if (!/^\d+$/.test(valueOf(environment, "SMTP_PORT"))) {
    errors.push("SMTP_PORT must be an integer")
  }
  if (!isValidEmailFrom(valueOf(environment, "EMAIL_FROM"))) {
    errors.push("EMAIL_FROM must contain exactly one valid mailbox")
  }

  const trustProxyHops = Number(valueOf(environment, "NODE_TRUST_PROXY_HOPS"))
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    errors.push("NODE_TRUST_PROXY_HOPS must be an integer between 0 and 5")
  }

  const configuredPort = environment.PORT ?? environment.NODE_PORT
  if (configuredPort !== undefined) {
    const port = Number(configuredPort)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      errors.push("PORT or NODE_PORT must be an integer between 1 and 65535")
    }
  }

  if (environment.WALLET_ENABLED === "1") {
    for (const key of ["LND_CERT", "LND_ADMIN_MACAROON", "LND_SOCKET"]) {
      if (!valueOf(environment, key) || PLACEHOLDER_PATTERN.test(valueOf(environment, key))) {
        errors.push(`${key} must be configured when WALLET_ENABLED=1`)
      }
    }
  }

  return errors
}

const productionErrors = getProductionEnvironmentErrors()
if (productionErrors.length) {
  throw new Error(`Invalid production environment:\n- ${productionErrors.join("\n- ")}`)
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

export const resolveWalletEnabled = (env: Record<string, string | undefined>) =>
  env.WALLET_ENABLED === "1" || (!env.WALLET_ENABLED && env.NODE_ENV !== "production")

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
    enabled: resolveWalletEnabled({
      NODE_ENV: envVars.NODE_ENV,
      WALLET_ENABLED: process.env.WALLET_ENABLED,
    }),
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
