import express from "express"
import authRoute from "./auth.route"
import userRoute from "./user.route"
import walletRoute from "./wallet.route"
import supportRoute from "./support.route"
import docsRoute from "./docs.route"
import config from "../../config/config"
import auth from "../../middlewares/auth"
import { UserPermission } from "../../config/roles"
import {
  authLimiter,
  feedbackLimiter,
  userLimiter,
  walletLimiter,
} from "../../middlewares/rateLimiter"
import { captureRouteBase } from "../../middlewares/error"

const router = express.Router()

const defaultRoutes = [
  {
    path: "/auth",
    middleware: authLimiter,
    route: authRoute,
  },
  {
    path: "/users",
    middleware: config.env === "production" ? userLimiter : null,
    route: userRoute,
  },
  {
    path: "/support",
    middleware: config.env === "production" ? feedbackLimiter : null,
    route: supportRoute,
  },
]

if (config.wallet.enabled) {
  defaultRoutes.push({
    path: "/wallet",
    middleware: config.env === "production" ? walletLimiter : null,
    route: walletRoute,
  })
}

const devRoutes = [
  {
    path: "/docs",
    route: docsRoute,
  },
]

defaultRoutes.forEach((route) => {
  if (route.middleware) {
    router.use(route.path, captureRouteBase(route.path), route.middleware, route.route)
  } else {
    router.use(route.path, captureRouteBase(route.path), route.route)
  }
})

if (config.docsEnabled) {
  devRoutes.forEach((route) => {
    const middleware = config.env === "production" ? [auth(UserPermission.users_write)] : []
    router.use(route.path, captureRouteBase(route.path), ...middleware, route.route)
  })
}

export default router
