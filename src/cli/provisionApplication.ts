import { PrismaClient } from "@prisma/client"
import {
  ApplicationProvisioningError,
  provisionApplicationServiceAccount,
} from "../services/applicationProvisioning"

const prisma = new PrismaClient()

const main = async () => {
  const application = await provisionApplicationServiceAccount({
    prisma,
    email: process.env.APPLICATION_SERVICE_EMAIL || "",
    password: process.env.APPLICATION_SERVICE_PASSWORD || "",
    allowedEmails: process.env.APPLICATION_EMAILS || "",
  })
  console.log(`Provisioned ${application.email} as ${application.role}`)
}

main()
  .catch((error) => {
    console.error(
      error instanceof ApplicationProvisioningError
        ? error.message
        : "Application provisioning failed"
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
