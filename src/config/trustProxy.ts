import type { Express } from "express"

export type TrustProxySetting = false | number | string[]

export const resolveTrustProxySetting = (
  trustedHops: number,
  trustedProxyIps: string[]
): TrustProxySetting => {
  if (trustedHops > 0) {
    return trustedHops
  }

  if (trustedProxyIps.length > 0) {
    return [...new Set(["loopback", ...trustedProxyIps])]
  }

  return false
}

export const configureTrustProxy = (
  app: Express,
  trustedHops: number,
  trustedProxyIps: string[]
) => {
  app.set("trust proxy", resolveTrustProxySetting(trustedHops, trustedProxyIps))
}
