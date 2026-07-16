import { Prisma, Role, User } from "@prisma/client"
import { Strategy as CustomStrategy } from "passport-custom"
import { Request } from "express"
import logger from "../logger"
import config from "../config"
import prisma from "../../client"
import { nip98 } from "nostr-tools"
import { SessionUser } from "../../types/user"

const getLoginUrl = (req: Request) => `${config.host.replace(/\/$/, "")}${req.baseUrl}${req.path}`

const nostrUserSelect = {
  id: true,
  email: true,
  twitter: true,
  avatarUrl: true,
  nostrPubkey: true,
  name: true,
  role: true,
  hasSeed: true,
  password: true,
} satisfies Prisma.UserSelect

type NostrAuthUser = Prisma.UserGetPayload<{ select: typeof nostrUserSelect }>

const createNostrUser = async (nostrPubkey: string): Promise<NostrAuthUser> => {
  try {
    return await prisma.user.create({
      data: {
        nostrPubkey,
        name: `nostr-${nostrPubkey.slice(0, 10)}`,
        role: Role.USER,
        wallet: {
          create: {
            balanceInSats: 0,
            disabled: !config.wallet.enabled,
          },
        },
      },
      select: nostrUserSelect,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.user.findUnique({
        where: { nostrPubkey },
        select: nostrUserSelect,
      })

      if (existing) {
        return existing
      }
    }

    throw error
  }
}

export const resolveNostrUser = async (
  nostrPubkey: string,
  currentUser?: Pick<User, "id"> | null
): Promise<NostrAuthUser> => {
  const linkedUser = await prisma.user.findUnique({
    where: { nostrPubkey },
    select: nostrUserSelect,
  })

  if (!currentUser) {
    return linkedUser ?? createNostrUser(nostrPubkey)
  }

  if (linkedUser && linkedUser.id !== currentUser.id) {
    throw new Error("Nostr public key is already connected to another account")
  }

  if (linkedUser) {
    return linkedUser
  }

  return prisma.user.update({
    where: { id: currentUser.id },
    data: { nostrPubkey },
    select: nostrUserSelect,
  })
}

export const nostrStrategy = new CustomStrategy(
  async (req: Request, done: (err: unknown, user: SessionUser | false) => void) => {
    try {
      logger.info("Attempting Nostr authentication")
      const token = req.body?.token
      if (!token) {
        return done(new Error("Nostr token is required"), false)
      }

      await nip98.validateToken(token, getLoginUrl(req), req.method)
      const event = await nip98.unpackEventFromToken(token)

      const user = await resolveNostrUser(event.pubkey, req.user as User | null)
      if (!user) {
        return done(new Error("Nostr authentication failed"), false)
      }

      const { password, ...safeUser } = user
      const hasPassword = Boolean(password)
      done(null, { ...safeUser, hasPassword })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error("Nostr authentication failed", { error: errorMessage, stack: errorStack })
      done(error, false)
    }
  }
)
