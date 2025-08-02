import { Role } from "@prisma/client"

export enum UserPermission {
  users_read = "users_read",
  users_write = "users_write",
  wallet_invoice = "wallet_read",
  wallet_pay = "wallet_pay",
  wallet_pay_user = "wallet_pay_user",
  root = "root",
}

const allRoles = {
  [Role.APPLICATION]: [
    UserPermission.users_read,
    UserPermission.wallet_invoice,
    UserPermission.wallet_pay_user,
  ],
  [Role.USER]: [
    UserPermission.wallet_invoice,
    UserPermission.wallet_pay,
    UserPermission.wallet_pay_user,
  ],
  [Role.ADMIN]: [
    UserPermission.wallet_invoice,
    UserPermission.wallet_pay,
    UserPermission.users_read,
    UserPermission.users_write,
    UserPermission.wallet_pay_user,
  ],
}

export const roles = Object.keys(allRoles)
export const roleRights = new Map(Object.entries(allRoles))
