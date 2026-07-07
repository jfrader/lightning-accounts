import { parseArgs } from "node:util"
import { PrismaClient } from "@prisma/client"
import { encryptPassword } from "../src/utils/encryption"

const options = {
  environment: { type: "string" },
  appEmail: { type: "string" },
  appPassword: { type: "string" },
  adminEmail: { type: "string" },
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

const adminCase = async (email: string, password: string) => {
  const alice = await prisma.user.upsert({
    where: { email: "admin_test@trucoshi.com" },
    update: {
      password: await encryptPassword(password),
      email: email,
    },
    create: {
      password: await encryptPassword(password),
      email: email,
      name: "Admin",
      role: "ADMIN",
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
    values: { environment, appEmail, appPassword, adminEmail, adminPassword },
  } = parseArgs({ options } as any)
  const password = (appPassword as string) || "trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123"
  const admPwd = (adminPassword as string) || "trucoshi123aaklsjdlaksdjlkas2ll2j2m12312313dddd"

  switch (environment) {
    default:
      await defaultCase((appEmail as string) || "admin@trucoshi.com", password)
      await adminCase((adminEmail as string) || "admin_test@trucoshi.com", admPwd)
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
