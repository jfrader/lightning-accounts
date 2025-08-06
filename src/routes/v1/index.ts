import express from "express"
import authRoute from "./auth.route"
import userRoute from "./user.route"
import walletRoute from "./wallet.route"
import docsRoute from "./docs.route"
import config from "../../config/config"
import { authLimiter, userLimiter, walletLimiter } from "../../middlewares/rateLimiter"

const router = express.Router()

const defaultRoutes = [
  {
    path: "/auth",
    middleware: config.env === "production" ? authLimiter : null,
    route: authRoute,
  },
  {
    path: "/users",
    middleware: config.env === "production" ? userLimiter : null,
    route: userRoute,
  },
  {
    path: "/wallet",
    middleware: config.env === "production" ? walletLimiter : null,
    route: walletRoute,
  },
]

const devRoutes = [
  {
    path: "/docs",
    route: docsRoute,
  },
]

defaultRoutes.forEach((route) => {
  if (route.middleware) {
    router.use(route.path, route.middleware, route.route)
  } else {
    router.use(route.path, route.route)
  }
})

if (config.env === "development") {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route)
  })
} else {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route)
  })
}

export default router
