import { parseArgs } from "node:util"
import { PrismaClient } from "@prisma/client"
import { encryptPassword } from "../src/utils/encryption"

const options = {
  environment: { type: "string" },
  appEmail: { type: "string" },
  appPassword: { type: "string" },
  adminPassword: { type: "string" },
}

const prisma = new PrismaClient()

const defaultCase = async (email: string, password: string) => {
  const alice = await prisma.user.upsert({
    where: { email: "admin@trucoshi.com" },
    update: {
      password: await encryptPassword(password),
      email: email,
    },
    create: {
      password: await encryptPassword(password),
      email: email,
      name: "Trucoshi",
      role: "APPLICATION",
      wallet: {
        create: {
          balanceInSats: 24000,
          disabled: false,
        },
      },
    },
  })
  console.log({ alice })
}

const admin = async (password: string) => {
  const admin = await prisma.user.upsert({
    where: { email: "admin_test@trucoshi.com" },
    update: {
      password: await encryptPassword(password),
      role: "ADMIN",
    },
    create: {
      password: await encryptPassword(password),
      email: "admin_test@trucoshi.com",
      name: "Admin Test",
      role: "ADMIN",
      wallet: {
        create: {
          balanceInSats: 24000,
          disabled: false,
        },
      },
    },
  })
  console.log({ admin })
}

const player = async (i: number) =>
  prisma.user.upsert({
    where: { email: i + "_e2e_player@trucoshi.com" },
    update: {},
    include: { wallet: true },
    create: {
      password: await encryptPassword("secret"),
      email: i + "_e2e_player@trucoshi.com",
      name: "Player " + i,
      role: "USER",
      wallet: {
        create: {
          balanceInSats: 24000,
          disabled: false,
        },
      },
    },
  })

const e2eCase = async () => {
  const players = []
  for (let i = 0; i < 6; i++) {
    players.push(await player(i))
  }
  console.log(players.reduce((p, c, i) => ({ ...p, ["player" + i]: c }), {}))
}

async function main() {
  const {
    values: { environment, appEmail, appPassword, adminPassword },
  } = parseArgs({ options } as any)
  const password = (appPassword as string) || "trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123"
  const adminTestPassword = (adminPassword as string) || "secret"

  switch (environment) {
    default:
      await defaultCase((appEmail as string) || "admin@trucoshi.com", password)
      await admin(adminTestPassword)
      await e2eCase()
      break
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
