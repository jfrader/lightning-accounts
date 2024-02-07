import { Strategy as CookieStrategy } from "passport-cookie"
import * as appsJson from "../../../applications.json"
import { isPasswordMatch } from "../../utils/encryption"
import { userService } from "../../services"
import { Request } from "express"
import logger from "../logger"
import exclude from "../../utils/exclude"
import config from "../config"

export const APPLICATION_STRATEGY_COOKIE = "Lightning-Application-Token"

const options = {
  cookieName: APPLICATION_STRATEGY_COOKIE,
  signed: false,
  passReqToCallback: true,
}

const verify = async (req: Request, cookie: string, done: (e: unknown, u: any) => void) => {
  try {
    const [email, token] = cookie.split(":")
    const app = appsJson.applications.find((a) => a.email === email)

    if (!app) {
      throw new Error("Application not found")
    }

    if (
      req.socket.remoteAddress !== app.remoteAddress &&
      req.socket.remoteAddress !== config.application.address
    ) {
      throw new Error("Unknown application host " + req.socket.remoteAddress)
    }

    const user = await userService.getUserByEmail(email, [
      "id",
      "password",
      "email",
      "name",
      "role",
    ])

    if (!user || !user.password) {
      throw new Error("Application user not found")
    }

    if (await isPasswordMatch(token, user.password)) {
      return done(null, exclude(user, ["password"]))
    }

    throw new Error("Invalid application credentials")
  } catch (e) {
    logger.error(e)
    done(e, null)
  }
}

export const applicationStrategy = new CookieStrategy(options, verify)
