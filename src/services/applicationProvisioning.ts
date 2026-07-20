import { Prisma, PrismaClient, Role } from "@prisma/client"
import { encryptPassword, isPasswordMatch } from "../utils/encryption"

const PLACEHOLDER_PATTERN =
  /(?:change me|replace[- ]with|example\.com|placeholder|local[- ]dev|not[- ]for[- ]production|password123|test[-_ ]?secret)/i

type ProvisioningClient = Pick<PrismaClient, "user">

type ProvisionApplicationOptions = {
  prisma: ProvisioningClient
  email: string
  password: string
  allowedEmails: string
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

export class ApplicationProvisioningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApplicationProvisioningError"
  }
}

const validatePassword = (password: string) => {
  if (
    password.trim().length < 32 ||
    PLACEHOLDER_PATTERN.test(password) ||
    /^(.)\1+$/.test(password)
  ) {
    throw new ApplicationProvisioningError(
      "APPLICATION_SERVICE_PASSWORD must be a non-placeholder secret of at least 32 characters"
    )
  }
}

export const provisionApplicationServiceAccount = async ({
  prisma,
  email: rawEmail,
  password,
  allowedEmails,
}: ProvisionApplicationOptions) => {
  const email = normalizeEmail(rawEmail)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || PLACEHOLDER_PATTERN.test(email)) {
    throw new ApplicationProvisioningError(
      "APPLICATION_SERVICE_EMAIL must be a valid non-placeholder email"
    )
  }
  validatePassword(password)

  const allowlist = allowedEmails.split(",").map(normalizeEmail).filter(Boolean)
  if (!allowlist.includes(email)) {
    throw new ApplicationProvisioningError(
      "APPLICATION_SERVICE_EMAIL must be present in APPLICATION_EMAILS"
    )
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, role: true },
  })
  if (existing && existing.role !== Role.APPLICATION) {
    throw new ApplicationProvisioningError(`Refusing to replace non-APPLICATION user ${email}`)
  }

  const select = { id: true, email: true, name: true, role: true } as const
  if (existing) {
    const passwordMatches = existing.password
      ? await isPasswordMatch(password, existing.password)
      : false
    const data: Prisma.UserUpdateInput = {
      isEmailVerified: true,
      wallet: {
        upsert: {
          create: { balanceInSats: 0, disabled: true },
          update: { disabled: true },
        },
      },
    }
    if (!passwordMatches) {
      data.password = await encryptPassword(password)
    }

    return prisma.user.update({
      where: { id: existing.id },
      data,
      select,
    })
  }

  const encryptedPassword = await encryptPassword(password)
  return prisma.user.create({
    data: {
      email,
      name: "Trucoshi Game",
      password: encryptedPassword,
      role: Role.APPLICATION,
      isEmailVerified: true,
      wallet: { create: { balanceInSats: 0, disabled: true } },
    },
    select,
  })
}
