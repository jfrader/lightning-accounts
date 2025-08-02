import { Strategy as CustomStrategy } from "passport-custom"
import { Request } from "express"
import prisma from "../../client"
import logger from "../logger"
import { isPasswordMatch } from "../../utils/encryption"
import { SessionUser } from "../../types/user"

export const seedStrategy = new CustomStrategy(
  async (req: Request, done: (err: unknown, user: SessionUser | false) => void) => {
    try {
      const { seedPhrase } = req.body
      if (!seedPhrase || typeof seedPhrase !== "string") {
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
        return done(null, false)
      }

      const isMatch = await isPasswordMatch(seedPhrase, user.seedHash)
      if (!isMatch) {
        return done(null, false)
      }

      done(null, user)
    } catch (error) {
      logger.error(error)
      done(error, false)
    }
  }
)
