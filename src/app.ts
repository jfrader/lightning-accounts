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
import routes from "./routes/v1"
import { errorConverter, errorHandler } from "./middlewares/error"
import ApiError from "./utils/ApiError"
import { jwtStrategy } from "./config/passport/jwt.strategy"
import { applicationStrategy } from "./config/passport/application.strategy"
import { twitterStrategy } from "./config/passport/twitter.strategy"
import { xStrategy } from "./config/passport/x.strategy"
import { seedStrategy } from "./config/passport/seed.strategy"
import { nostrStrategy } from "./config/passport/nostr.strategy"
import session from "express-session"
import { User } from "@prisma/client"
import path from "node:path"
import { SessionCookie } from "./types/tokens"
import { getCookieName } from "./utils/authCookie"
import { PrismaSessionStore } from "./config/session"
import prisma from "./client"
import healthRoutes from "./health"
import { configureTrustProxy } from "./config/trustProxy"
import requestOrigin from "./middlewares/requestOrigin"

const secure = config.env === "production"
const cookieDomain = secure && config.domain ? config.domain : undefined

const app = express()
app.disable("x-powered-by")

configureTrustProxy(app, config.trustProxyHops, config.trustedProxyIps)

passport.serializeUser(function (user, done) {
  done(null, user)
})

passport.deserializeUser<User>(function (user, done) {
  done(null, user)
})

const CORS_OPTS: CorsOptions = {
  origin: config.origins.includes("*") ? true : config.origins,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}

if (config.env !== "test") {
  app.use(morgan.successHandler)
  app.use(morgan.errorHandler)
}

app.use(helmet())
app.use(express.json({ limit: "100kb" }))
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 1000 }))
app.use(xss())
app.use(compression())
app.use(cookieParser(config.jwt.secret))
app.use(cors(CORS_OPTS))
app.use(requestOrigin(config.origins))
app.use("/health", healthRoutes)

app.options("*any", cors(CORS_OPTS))

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
      domain: cookieDomain,
      sameSite: "lax",
      secure,
    },
  })
)

app.use(passport.initialize())
app.use(passport.session())

passport.use("application", applicationStrategy)
passport.use("jwt", jwtStrategy)
passport.use("twitter", twitterStrategy)
passport.use("x", xStrategy)
passport.use("seed", seedStrategy)
passport.use("nostr", nostrStrategy)

app.use("/v1", routes)

app.use((_req, _res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"))
})

app.use(errorConverter)
app.use(errorHandler)

export default app
