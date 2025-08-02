import { Strategy as CustomStrategy } from "passport-custom"
import { Request } from "express"
import prisma from "../../client"
import logger from "../logger"
import { isPasswordMatch } from "../../utils/encryption"
import { SessionUser } from "../../types/user"

export const seedStrategy = new CustomStrategy(
  async (req: Request, done: (err: unknown, user: SessionUser | false) => void) => {
    try {
      logger.info("Attempting seed phrase authentication", {})
      const { seedPhrase } = req.body
      if (!seedPhrase || typeof seedPhrase !== "string") {
        logger.error("Invalid seed phrase", { seedPhraseLength: seedPhrase?.length || 0 })
        return done(new Error("Seed phrase is required"), false)
      }

      const user = await prisma.user.findFirst({
        where: { seedHash: { not: null } },
        select: {
          id: true,
          email: true,
          twitter: true,
          nostrPubkey: true,
          name: true,
          role: true,
          avatarUrl: true,
          seedHash: true,
        },
      })

      if (!user || !user.seedHash) {
        logger.error("User not found or no seed hash", { seedPhraseLength: seedPhrase.length })
        return done(null, false)
      }

      logger.debug("Comparing seed phrase", { userId: user.id, email: user.email })
      const isMatch = await isPasswordMatch(seedPhrase, user.seedHash)
      if (!isMatch) {
        logger.error("Seed phrase mismatch", { userId: user.id, email: user.email })
        return done(null, false)
      }

      logger.info("Seed phrase authentication successful", { userId: user.id, email: user.email })
      done(null, user)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error("Seed phrase authentication failed", { error: errorMessage, stack: errorStack })
      done(error, false)
    }
  }
)
