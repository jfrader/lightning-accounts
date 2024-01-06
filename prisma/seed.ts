import { PrismaClient } from "@prisma/client"
import { encryptPassword } from "../src/utils/encryption"
const prisma = new PrismaClient()
async function main() {
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
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
