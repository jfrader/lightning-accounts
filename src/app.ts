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
import session from "express-session"
import { User } from "@prisma/client"
import path from "node:path"
import { SessionCookie } from "./types/tokens"

const secure = config.env === "production"

const app = express()
app.set("trust proxy", 1)

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

// set security HTTP headers
app.use(helmet())

// parse json request body
app.use(express.json())

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }))

// sanitize request data
app.use(xss())

// gzip compression
app.use(compression())

app.use(cookieParser(config.jwt.secret))

// enable cors
app.use(cors(CORS_OPTS))
app.options("*", cors(CORS_OPTS))

app.get("/js/autoclose.js", (req, res) => {
  res.sendFile("autoclose.js", { root: path.join("src", "static") })
})

app.use(
  session({
    secret: config.jwt.secret,
    resave: false,
    saveUninitialized: true,
    name: SessionCookie.sid,
    cookie: {
      httpOnly: true,
      domain: secure ? config.domain : undefined,
      sameSite: secure ? "none" : "lax",
      signed: secure,
      secure,
    },
  })
)

// authentication
app.use(passport.initialize())
app.use(passport.session())

passport.use("application", applicationStrategy)
passport.use("jwt", jwtStrategy)
passport.use("twitter", twitterStrategy)

// limit repeated failed requests to auth endpoints
if (config.env === "production") {
  app.use("/v1/auth", authLimiter)
}

// v1 api routes
app.use("/v1", routes)

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"))
})

// convert error to ApiError, if needed
app.use(errorConverter)

// handle error
app.use(errorHandler)

export default app
