export const getDatabaseTargetErrors = (
  value: string | undefined,
  expectedSchema: string,
  expectedDatabase?: string,
  expectedUsername?: string,
  expectedConnectionLimit?: number
) => {
  const errors: string[] = []

  try {
    const url = new URL(value || "")
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1) ||
      url.hash
    ) {
      throw new Error("invalid PostgreSQL URL")
    }

    const schemas = url.searchParams.getAll("schema")
    if (schemas.length !== 1 || schemas[0] !== expectedSchema) {
      errors.push(`DATABASE_URL must explicitly use schema=${expectedSchema}`)
    }

    if (expectedConnectionLimit !== undefined) {
      const connectionLimits = url.searchParams.getAll("connection_limit")
      if (
        connectionLimits.length !== 1 ||
        connectionLimits[0] !== String(expectedConnectionLimit)
      ) {
        errors.push(`DATABASE_URL must explicitly use connection_limit=${expectedConnectionLimit}`)
      }
    }

    if (expectedDatabase) {
      let database = ""
      try {
        database = decodeURIComponent(url.pathname.slice(1))
      } catch {
        errors.push("DATABASE_URL contains an invalid encoded database name")
      }
      if (database && database !== expectedDatabase) {
        errors.push(`DATABASE_URL must target database ${expectedDatabase}`)
      }
    }

    if (expectedUsername) {
      let username = ""
      try {
        username = decodeURIComponent(url.username)
      } catch {
        errors.push("DATABASE_URL contains an invalid encoded username")
      }
      if (username && username !== expectedUsername) {
        errors.push(`DATABASE_URL must authenticate as ${expectedUsername}`)
      } else if (!username) {
        errors.push(`DATABASE_URL must authenticate as ${expectedUsername}`)
      }
      if (!url.password) {
        errors.push("DATABASE_URL must include a password")
      }
    }
  } catch {
    errors.push("DATABASE_URL must be a PostgreSQL connection URL")
  }

  return errors
}

export type DatabaseTargetIdentity = {
  databaseName: string
  schemaName: string
  userName: string
  ownerName: string
}

export const getDatabaseIdentityErrors = (
  identity: DatabaseTargetIdentity | undefined,
  expectedDatabase: string,
  expectedSchema: string,
  expectedUsername: string
) => {
  if (!identity) {
    return ["DATABASE_URL did not return a database identity"]
  }

  const errors: string[] = []
  if (identity.databaseName !== expectedDatabase) {
    errors.push(`connected database must be ${expectedDatabase}`)
  }
  if (identity.schemaName !== expectedSchema) {
    errors.push(`connected schema must be ${expectedSchema}`)
  }
  if (identity.userName !== expectedUsername) {
    errors.push(`connected user must be ${expectedUsername}`)
  }
  if (identity.ownerName !== expectedUsername) {
    errors.push(`database owner must be ${expectedUsername}`)
  }

  return errors
}
