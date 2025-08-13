import { Strategy as CustomStrategy } from "passport-custom"
import { Request } from "express"
import prisma from "../../client"
import logger from "../logger"
import { createHmac } from "crypto"
import { SessionUser } from "../../types/user"
import config from "../config"

const hashSeedPhrase = (seedPhrase: string): string => {
  return createHmac("sha256", config.seedHashSecret).update(seedPhrase).digest("hex")
}

export const seedStrategy = new CustomStrategy(
  async (req: Request, done: (err: unknown, user: SessionUser | false) => void) => {
    try {
      logger.info("Attempting seed phrase authentication")
      const { seedPhrase } = req.body
      if (!seedPhrase || typeof seedPhrase !== "string") {
        logger.error("Invalid seed phrase")
        return done(new Error("Seed phrase is required"), false)
      }

      const hashedSeed = hashSeedPhrase(seedPhrase.toLowerCase())

      const user = await prisma.user.findFirst({
        where: {
          seedHash: hashedSeed,
          hasSeed: true,
        },
        select: {
          id: true,
          email: true,
          twitter: true,
          nostrPubkey: true,
          name: true,
          role: true,
          avatarUrl: true,
          seedHash: true,
          hasSeed: true,
        },
      })

      if (!user) {
        logger.error("User not found with provided seed phrase")
        return done(null, false)
      }

      logger.info("Seed phrase authentication successful", {
        userId: user.id,
        email: user.email,
      })
      done(null, user)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error("Seed phrase authentication failed", { error: errorMessage, stack: errorStack })
      done(error, false)
    }
  }
)
