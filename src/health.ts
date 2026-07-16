import { Router } from "express"
import { version as packageVersion } from "../package.json"
import config from "./config/config"

let ready = false

export const setReady = (value: boolean) => {
  ready = value
}

export const isReady = () => ready

export const getHealthMetadata = () => ({
  version: process.env.RENDER_GIT_COMMIT?.trim() || packageVersion,
  walletEnabled: config.wallet.enabled,
})

const router = Router()

router.get("/live", (_req, res) => {
  res.status(200).json({ status: "ok", ...getHealthMetadata() })
})

router.get("/ready", (_req, res) => {
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? "ready" : "not_ready", ...getHealthMetadata() })
})

export default router
