import dotenv from "dotenv"
import path from "path"
import Joi from "joi"

dotenv.config({ path: path.join(process.cwd(), ".env") })

const envVarsSchema = Joi.object()
  .keys({
    WALLET_LIMIT: Joi.string().description("Maximum allowed sats per wallet"),
    NODE_ENV: Joi.string().valid("production", "development", "test").required(),
    NODE_PORT: Joi.number().default(3000),
    NODE_ORIGIN: Joi.string().required().description("Allowed origin"),
    NODE_DOMAIN: Joi.string()
      .empty("")
      .default("")
      .description("The domain for cookie like '.example.com'"),
    NODE_HOST: Joi.string().description("The host URL of the API for twitter.strategy"),
    NODE_DEBUG_LEVEL: Joi.string().description(
      "Debug level (trace, debug, info, warning, error, fatal)"
    ),
    APPLICATION_ADDRESS: Joi.string()
      .optional()
      .description(
        "Address that will be accepted for applications to login, bypassing applications.json config"
      ),
    TWITTER_CLIENT_ID: Joi.string().description("Twitter developer client ID"),
    TWITTER_CLIENT_SECRET: Joi.string().description("Twitter developer client secret"),
    TWITTER_CLIENT_TYPE: Joi.string().description(
      "Twitter developer client type (confidential, private, public)"
    ),
    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_BASE64_PUBLIC_KEY: Joi.string().required().description("Base64 encoded public key"),
    JWT_BASE64_PRIVATE_KEY: Joi.string().required().description("Base64 encoded private key"),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    SMTP_HOST: Joi.string().description("server that will send the emails"),
    SMTP_PORT: Joi.number().description("port to connect to the email server"),
    SMTP_USERNAME: Joi.string().description("username for email server"),
    SMTP_PASSWORD: Joi.string().description("password for email server"),
    EMAIL_FROM: Joi.string().description("the from field in the emails sent by the app"),
    LND_CERT: Joi.string().description("LND tls.cert encoded in base64"),
    LND_ADMIN_MACAROON: Joi.string().description("LND admin.macaroon encoded in base64"),
    LND_SOCKET: Joi.string().description("LND host socket"),
  })
  .unknown()

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env)

if (error) {
  throw new Error(`Config validation error: ${error.message}`)
}

export default {
  env: envVars.NODE_ENV,
  port: envVars.NODE_PORT,
  origin: envVars.NODE_ORIGIN,
  host: envVars.NODE_HOST,
  domain: envVars.NODE_DOMAIN,
  debug_level: envVars.NODE_DEBUG_LEVEL,
  application: {
    address: envVars.APPLICATION_ADDRESS,
  },
  twitter: {
    clientID: envVars.TWITTER_CLIENT_ID,
    clientSecret: envVars.TWITTER_CLIENT_SECRET,
    clientType: envVars.TWITTER_CLIENT_TYPE,
  },
  wallet: {
    limit: envVars.WALLET_LIMIT,
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
  },
  lnurl: {
    host: envVars.LNURL_HOST,
    port: envVars.LNUR_PORT,
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
}
