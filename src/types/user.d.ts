import { User } from "@prisma/client"

export type UserWithWallet = Prisma.UserGetPayload<{
  include: { wallet: { select: { id: true; balanceInSats: true; disabled: true } } }
}>

export type PublicUser = Pick<User, "id" | "role" | "name" | "avatarUrl">

export type SessionUser = Pick<
  User,
  "id" | "email" | "twitter" | "role" | "name" | "avatarUrl" | "nostrPubkey" | "hasSeed"
>
