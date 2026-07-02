import { parseArgs } from "node:util"
import dotenv from "dotenv"
import { PrismaClient, Role } from "@prisma/client"

dotenv.config()

const options = {
  email: { type: "string", short: "e" },
} as const

const prisma = new PrismaClient()

async function main() {
  const {
    values: { email: rawEmail },
  } = parseArgs({ options })

  const email = rawEmail?.trim()
  if (!email) {
    throw new Error("Missing required --email value")
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  })

  if (!user) {
    throw new Error(`No user found with email ${email}`)
  }

  if (user.role === Role.APPLICATION) {
    throw new Error(`Refusing to change APPLICATION service account ${email}`)
  }

  if (user.role === Role.ADMIN) {
    console.log(`User ${user.email} is already an admin`)
    return
  }

  const admin = await prisma.user.update({
    where: { id: user.id },
    data: { role: Role.ADMIN },
    select: { id: true, email: true, name: true, role: true },
  })

  console.log(`Promoted ${admin.email} to ${admin.role}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
