import { Role } from "@prisma/client"

export enum UserRights {
  users_read = "users_read",
  users_write = "users_write",
  wallet_invoice = "wallet_read",
  wallet_pay = "wallet_pay",
  root = "root",
}

const allRoles = {
  [Role.USER]: [UserRights.wallet_invoice, UserRights.wallet_pay],
  [Role.ADMIN]: [
    UserRights.wallet_invoice,
    UserRights.wallet_pay,
    UserRights.users_read,
    UserRights.users_write,
  ],
}

export const roles = Object.keys(allRoles)
export const roleRights = new Map(Object.entries(allRoles))
