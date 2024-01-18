import { parseArgs } from "node:util"
import { PrismaClient } from "@prisma/client"
import { encryptPassword } from "../src/utils/encryption"

const options = {
  environment: { type: "string" },
}

const prisma = new PrismaClient()

const defaultCase = async () => {
  const alice = await prisma.user.upsert({
    where: { email: "admin@trucoshi.com" },
    update: {},
    create: {
      password: await encryptPassword("trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123"),
      email: "admin@trucoshi.com",
      name: "Trucoshi",
      role: "APPLICATION",
      wallet: {
        create: {
          balanceInSats: 0,
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
          balanceInSats: 1000,
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
    values: { environment },
  } = parseArgs({ options } as any)

  switch (environment) {
    case "e2e":
      await defaultCase()
      await e2eCase()
      break
    default:
      await defaultCase()
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
