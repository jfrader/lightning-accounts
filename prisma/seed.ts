import { PrismaClient, Role } from "@prisma/client"
import { encryptPassword } from "../src/utils/encryption"

export const getSeedCredentials = (environment: NodeJS.ProcessEnv) => {
  if (!["development", "test"].includes(environment.NODE_ENV || "")) {
    throw new Error("Seeding is allowed only in development/test")
  }
  const required = [
    "SEED_APP_EMAIL",
    "SEED_APP_PASSWORD",
    "SEED_ADMIN_EMAIL",
    "SEED_ADMIN_PASSWORD",
    "SEED_E2E_PASSWORD",
  ] as const
  for (const name of required) {
    if (!environment[name]?.trim()) throw new Error(`${name} is required for seeding`)
  }
  return {
    appEmail: environment.SEED_APP_EMAIL!,
    appPassword: environment.SEED_APP_PASSWORD!,
    adminEmail: environment.SEED_ADMIN_EMAIL!,
    adminPassword: environment.SEED_ADMIN_PASSWORD!,
    e2ePassword: environment.SEED_E2E_PASSWORD!,
  }
}

export const seed = async () => {
  const credentials = getSeedCredentials(process.env)
  const prisma = new PrismaClient()
  try {
    const users = [
      {
        email: credentials.appEmail,
        password: credentials.appPassword,
        name: "Application",
        role: Role.APPLICATION,
      },
      {
        email: credentials.adminEmail,
        password: credentials.adminPassword,
        name: "Admin",
        role: Role.ADMIN,
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        email: `${i}_e2e_player@trucoshi.com`,
        password: credentials.e2ePassword,
        name: `Player ${i}`,
        role: Role.USER,
      })),
    ]
    for (const { password, ...user } of users) {
      const hashedPassword = await encryptPassword(password)
      await prisma.user.upsert({
        where: { email: user.email },
        update: { password: hashedPassword },
        create: {
          ...user,
          password: hashedPassword,
          wallet: { create: { balanceInSats: 24000, disabled: false } },
        },
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
