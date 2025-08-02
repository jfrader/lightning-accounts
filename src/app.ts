import express from "express"
import helmet from "helmet"
import compression from "compression"
import cors, { CorsOptions } from "cors"
import passport from "passport"
import httpStatus from "http-status"
import config from "./config/config"
import morgan from "./config/morgan"
import xss from "./middlewares/xss"
import cookieParser from "cookie-parser"
import { authLimiter } from "./middlewares/rateLimiter"
import routes from "./routes/v1"
import { errorConverter, errorHandler } from "./middlewares/error"
import ApiError from "./utils/ApiError"
import { jwtStrategy } from "./config/passport/jwt.strategy"
import { applicationStrategy } from "./config/passport/application.strategy"
import { twitterStrategy } from "./config/passport/twitter.strategy"
import { seedStrategy } from "./config/passport/seed.strategy"
import session from "express-session"
import { User } from "@prisma/client"
import path from "node:path"
import { SessionCookie } from "./types/tokens"
import { getCookieName } from "./utils/authCookie"
import { PrismaClient } from "@prisma/client"
import { PrismaSessionStore } from "./config/session"

const secure = config.env === "production"
const prisma = new PrismaClient()

const app = express()

// Set trust proxy based on config
const trustedProxies = ["loopback", ...config.trustedProxyIps]
app.set("trust proxy", trustedProxies)

// Debug logging for IP headers
app.use((req, res, next) => {
  console.log(
    "Client IP:",
    req.ip,
    "X-Forwarded-For:",
    req.headers["x-forwarded-for"],
    "X-Real-IP:",
    req.headers["x-real-ip"]
  )
  next()
})

passport.serializeUser(function (user, done) {
  done(null, user)
})

passport.deserializeUser<User>(function (user, done) {
  done(null, user)
})

const CORS_OPTS: CorsOptions = {
  origin: config.origin ? config.origin.split(",") : "*",
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
}

if (config.env !== "test") {
  app.use(morgan.successHandler)
  app.use(morgan.errorHandler)
}

app.use(helmet())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(xss())
app.use(compression())
app.use(cookieParser(config.jwt.secret))
app.use(cors(CORS_OPTS))

app.options("*", cors(CORS_OPTS))

app.get("/js/autoclose.js", (req, res) => {
  res.sendFile("autoclose.js", { root: path.join(__dirname, "static") })
})

app.use(
  session({
    store: new PrismaSessionStore(prisma),
    secret: config.jwt.secret,
    name: getCookieName(SessionCookie.sid),
    proxy: secure,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000,
      domain: secure ? config.domain : undefined,
      sameSite: secure ? "none" : "lax",
      secure,
    },
  })
)

app.use(passport.initialize())
app.use(passport.session())

passport.use("application", applicationStrategy)
passport.use("jwt", jwtStrategy)
passport.use("twitter", twitterStrategy)
passport.use("seed", seedStrategy)

if (config.env === "production") {
  app.use("/v1/auth", authLimiter)
}

app.use("/v1", routes)

app.use((_req, _res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"))
})

app.use(errorConverter)
app.use(errorHandler)

export default app
