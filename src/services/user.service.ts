import { User, Role, Prisma, Wallet } from "@prisma/client"
import httpStatus from "http-status"
import prisma from "../client"
import ApiError from "../utils/ApiError"
import { encryptPassword } from "../utils/encryption"
import { UserWithWallet } from "../types/user"
import { Profile } from "@superfaceai/passport-twitter-oauth2"

export const USER_DEFAULT_FIELDS = ["id", "email", "name", "role", "twitter", "avatarUrl"]
export const USER_PRIVATE_FIELDS = ["password", "isEmailVerified", "createdAt", "updatedAt"]

/**
 * Create a user
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
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

/**
 * Upsert a twitter user
 * @returns {Promise<User>}
 */
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
      name: true,
      role: true,
    },
  })

  if (!user) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to upsert user")
  }

  return user
}

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
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

/**
 * Get user by id
 * @param {ObjectId} id
 * @param {Array<Key>} keys
 * @returns {Promise<Pick<User, Key> | null>}
 */
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

/**
 * Get user and their wallet by id
 * @param {ObjectId} id
 * @param {Array<Key>} keys
 * @returns {Promise<Pick<User, Key> | null>}
 */
const getUserWithWallet = async <Key extends keyof UserWithWallet>(
  id: number,
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<Pick<UserWithWallet, Key> | null> => {
  return getUserById(id, [...keys, "wallet"])
}

/**
 * Get user by email
 * @param {string} email
 * @param {Array<Key>} keys
 * @returns {Promise<Pick<User, Key> | null>}
 */
const getUserByEmail = async <Key extends keyof User>(
  email: string,
  keys: Key[] = USER_DEFAULT_FIELDS as Key[]
): Promise<Pick<User, Key> | null> => {
  return prisma.user.findUnique({
    where: { email },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
  }) as Promise<Pick<User, Key> | null>
}

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async <Key extends keyof User>(
  userId: number,
  updateBody: Prisma.UserUpdateInput,
  keys: Key[] = ["id", "email", "name", "role"] as Key[]
): Promise<Pick<User, Key> | null> => {
  const user = await getUserById(userId, ["id", "email", "name", "twitter", "avatarUrl"])
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  if (updateBody.email && (await getUserByEmail(updateBody.email as string))) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email already taken")
  }
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateBody,
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {}),
  })
  return updatedUser as Pick<User, Key> | null
}

/**
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<UserWithWallet>}
 */
const deleteUserById = async (userId: number): Promise<UserWithWallet> => {
  const user = await getUserById(userId)
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
  await prisma.user.delete({ where: { id: user.id } })
  return user
}

/**
 * Get user wallet
 * @param {ObjectId} userId
 * @returns {Promise<Wallet>}
 */
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

export default {
  createUser,
  upsertTwitterUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  getUserWithWallet,
  getUserWallet,
}
