import { PrismaClient } from "@prisma/client"
import {
  DatabaseTargetIdentity,
  getDatabaseIdentityErrors,
  getDatabaseTargetErrors,
} from "../config/databaseTarget"

const [expectedDatabase, expectedSchema, expectedUsername] = process.argv.slice(2)

const refuse = (errors: string[]) => {
  console.error(`Refusing database migration:\n- ${errors.join("\n- ")}`)
  process.exitCode = 1
}

const main = async () => {
  if (!expectedDatabase || !expectedSchema || !expectedUsername) {
    refuse(["expected database name, schema, and username arguments"])
    return
  }

  const errors = getDatabaseTargetErrors(
    process.env.DATABASE_URL,
    expectedSchema,
    expectedDatabase,
    expectedUsername,
    10
  )

  if (errors.length) {
    refuse(errors)
    return
  }

  const prisma = new PrismaClient()
  try {
    const identities = await prisma.$queryRaw<DatabaseTargetIdentity[]>`
      SELECT
        current_database() AS "databaseName",
        current_schema() AS "schemaName",
        current_user AS "userName",
        pg_get_userbyid(datdba) AS "ownerName"
      FROM pg_database
      WHERE datname = current_database()
    `
    const identityErrors = getDatabaseIdentityErrors(
      identities.length === 1 ? identities[0] : undefined,
      expectedDatabase,
      expectedSchema,
      expectedUsername
    )
    if (identityErrors.length) {
      refuse(identityErrors)
      return
    }

    console.log(
      `Database migration target confirmed: ${expectedUsername}@${expectedDatabase}.${expectedSchema}`
    )
  } catch {
    refuse(["unable to connect and verify the database identity"])
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(() => refuse(["unexpected database identity check failure"]))
