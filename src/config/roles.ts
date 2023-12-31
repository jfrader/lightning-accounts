import { Role } from "@prisma/client"

export enum UserPermission {
  users_read = "users_read",
  users_write = "users_write",
  wallet_invoice = "wallet_read",
  wallet_pay = "wallet_pay",
  verify_user_identity = "verify_user_identity",
  root = "root",
}

const allRoles = {
  [Role.USER]: [UserPermission.wallet_invoice, UserPermission.wallet_pay],
  [Role.ADMIN]: [
    UserPermission.wallet_invoice,
    UserPermission.wallet_pay,
    UserPermission.users_read,
    UserPermission.users_write,
  ],
}

export const roles = Object.keys(allRoles)
export const roleRights = new Map(Object.entries(allRoles))
