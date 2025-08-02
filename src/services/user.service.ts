import { User, Role, Prisma, Wallet } from "@prisma/client"
import httpStatus from "http-status"
import prisma from "../client"
import ApiError from "../utils/ApiError"
import { encryptPassword } from "../utils/encryption"
import { UserWithWallet } from "../types/user"
import { Profile } from "@superfaceai/passport-twitter-oauth2"
import authService from "./auth.service"
import { getRecoveryPassword } from "../utils/string/getRandomWord"
import { createHmac } from "crypto"
import config from "../config/config"

const hashSeedPhrase = (seedPhrase: string): string => {
  return createHmac("sha256", config.seedHashSecret).update(seedPhrase).digest("hex")
}

export const USER_DEFAULT_FIELDS = ["id", "name", "role", "avatarUrl"]
export const USER_PRIVATE_FIELDS = [
  "email",
  "twitter",
  "isEmailVerified",
  "createdAt",
  "updatedAt",
  "hasSeed",
]

const createUser = async (
  email: string,
  password: string,
  name: string,
  role: Role = Role.USER
) => {
  if (await getUserByEmail(email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email already taken")
  }

  return prisma.user.create({
    data: {
      email,
      name,
      password: await encryptPassword(password),
      role,
      wallet: { create: { balanceInSats: 0, disabled: false } },
    },
  })
}

const createUserWithSeed = async (name: string) => {
  const seedPhrase = getRecoveryPassword(5, " ")
  const seedHash = hashSeedPhrase(seedPhrase)
  const user = await prisma.user.create({
    data: {
      name,
      seedHash,
      hasSeed: true,
      role: Role.USER,
      wallet: { create: { balanceInSats: 0, disabled: false } },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      twitter: true,
      nostrPubkey: true,
    },
  })
  return { user, seedPhrase }
}

const upsertTwitterUser = async (
  { id, displayName, username, photos, name }: Profile,
  currentUser?: User | null
) => {
  const user = await prisma.user.upsert({
    where: currentUser ? { id: currentUser.id } : { twitterId: id },
    create: {
      twitterId: id,
      twitter: username,
      name: name?.givenName || displayName,
      avatarUrl: photos ? photos[0].value || null : null,
      role: Role.USER,
      wallet: {
        create: {
          balanceInSats: 0,
          disabled: false,
        },
      },
    },
    update: {
      twitter: username,
      twitterId: id,
      avatarUrl: photos ? photos[0].value || null : null,
    },
    select: {
      id: true,
      email: true,
      twitter: true,
      avatarUrl: true,
      nostrPubkey: true,
      name: true,
      role: true,
      hasSeed: true,
    },
  })

  if (!user) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to upsert user")
  }
  return user
}

const queryUsers = async <Key extends keyof User>(
  filter: object,
  options: {
    limit?: number
    page?: number
    sortBy?: string
    sortType?: "asc" | "desc"
  },
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<Pick<User, Key>[]> => {
  const page = options.page ?? 0
  const limit = options.limit ?? 10
  const sortBy = options.sortBy
  const sortType = options.sortType ?? "desc"
  const users = await prisma.user.findMany({
    where: filter,
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
    skip: page * limit,
    take: limit,
    orderBy: sortBy ? { [sortBy]: sortType } : undefined,
  })

  return users as Pick<User, Key>[]
}

const getUserById = async <Key extends keyof UserWithWallet>(
  id: number,
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<Pick<UserWithWallet, Key> | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}) },
  })

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  return user as Promise<Pick<UserWithWallet, Key> | null>
}

const getUserWithWallet = async <Key extends keyof UserWithWallet>(
  id: number,
  keys: Key[] = [...USER_DEFAULT_FIELDS, ...USER_PRIVATE_FIELDS] as Key[]
): Promise<Pick<UserWithWallet, Key> | null> => {
  return getUserById(id, [...keys, "wallet"])
}

const getUserByEmail = async <Key extends keyof User>(
  email: string,
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<Pick<User, Key> | null> => {
  return prisma.user.findUnique({
    where: { email },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
  }) as Promise<Pick<User, Key> | null>
}

const updateUserById = async <Key extends keyof User>(
  userId: number,
  updateBody: Prisma.UserUpdateInput,
  keys: Key[] = ["id", "email", "name", "role"] as Key[],
  requirePassword: boolean,
  password?: string
): Promise<Pick<User, Key> | null> => {
  const user = await getUserById(userId, ["id", "email", "name", "twitter", "avatarUrl"])
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  if (updateBody.email && (await getUserByEmail(updateBody.email as string))) {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, "Email already taken")
  }

  if (updateBody.name && updateBody.name.toString().length > 16) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Name too long")
  }
  if (requirePassword && user.email && (updateBody.email || updateBody.password)) {
    if (!password) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Password not provided")
    }
    const isMatch = await authService.loginUserWithEmailAndPassword(user.email, password)
    if (!isMatch) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Password doesn't match")
    }
  }
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...updateBody,
      password: updateBody.password
        ? await encryptPassword(updateBody.password as string)
        : undefined,
    },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
  })
  return updatedUser as Pick<User, Key> | null
}

const deleteUserById = async (userId: number): Promise<UserWithWallet> => {
  const user = await getUserById(userId)
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  await prisma.user.delete({ where: { id: user.id } })
  return user
}

const getUserWallet = async (userId: number): Promise<Wallet> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  })

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  if (!user.wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, "Wallet not found")
  }
  return user.wallet
}

const addSeedToUser = async <Key extends keyof User>(
  userId: number,
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<{ user: Pick<User, Key>; seedPhrase: string }> => {
  const user = await getUserById(userId, [
    "id",
    "email",
    "twitterId",
    "seedHash",
    "hasSeed",
    "nostrPubkey",
  ])
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }

  // Check for other authentication methods
  const hasOtherAuthMethod = user.email || user.twitterId || user.nostrPubkey
  if (user.seedHash && user.hasSeed && !hasOtherAuthMethod) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot update seed phrase without another auth method"
    )
  }

  const seedPhrase = getRecoveryPassword(5, " ")
  const seedHash = hashSeedPhrase(seedPhrase)

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      seedHash,
      hasSeed: true,
    },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
  })

  return { user: updatedUser as Pick<User, Key>, seedPhrase }
}

export default {
  createUser,
  createUserWithSeed,
  upsertTwitterUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  getUserWithWallet,
  getUserWallet,
  addSeedToUser,
}
