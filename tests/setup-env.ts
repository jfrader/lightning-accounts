import { generateKeyPairSync } from "node:crypto"
import dotenv from "dotenv"

dotenv.config({ path: ".env.test" })
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})
process.env.JWT_BASE64_PRIVATE_KEY = Buffer.from(privateKey).toString("base64")
process.env.JWT_BASE64_PUBLIC_KEY = Buffer.from(publicKey).toString("base64")
process.env.SENTRY_DSN = ""
