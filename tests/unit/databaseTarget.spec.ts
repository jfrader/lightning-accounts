import { getDatabaseIdentityErrors, getDatabaseTargetErrors } from "../../src/config/databaseTarget"

describe("database target validation", () => {
  it("accepts only the expected database and explicit schema", () => {
    expect(
      getDatabaseTargetErrors(
        "postgresql://lightning_accounts_app:secret@postgres.internal:5432/lightning_accounts?schema=public&connection_limit=10&sslmode=require",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toEqual([])

    expect(
      getDatabaseTargetErrors(
        "postgresql://lightning_accounts_app:secret@postgres.internal:5432/trucoshi?schema=public&connection_limit=10&sslmode=require",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toContain("DATABASE_URL must target database lightning_accounts")

    expect(
      getDatabaseTargetErrors(
        "postgresql://lightning_accounts_app:secret@postgres.internal:5432/lightning_accounts?schema=accounts&connection_limit=10&sslmode=require",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toContain("DATABASE_URL must explicitly use schema=public")

    expect(
      getDatabaseTargetErrors(
        "postgresql://trucoshi_admin:secret@postgres.internal:5432/lightning_accounts?schema=public&connection_limit=20&sslmode=require",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toEqual(
      expect.arrayContaining([
        "DATABASE_URL must authenticate as lightning_accounts_app",
        "DATABASE_URL must explicitly use connection_limit=10",
      ])
    )

    expect(
      getDatabaseTargetErrors(
        "postgresql://lightning_accounts_app@postgres.internal:5432/lightning_accounts?schema=public&connection_limit=10&sslmode=require",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toContain("DATABASE_URL must include a password")

    expect(
      getDatabaseTargetErrors(
        "postgresql://lightning_accounts_app:secret@postgres.internal:5432/lightning_accounts?schema=public&schema=public&connection_limit=10",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toEqual(
      expect.arrayContaining([
        "DATABASE_URL must explicitly use schema=public",
        "DATABASE_URL must explicitly use sslmode=require",
      ])
    )

    expect(
      getDatabaseTargetErrors(
        "not-a-postgres-url",
        "public",
        "lightning_accounts",
        "lightning_accounts_app",
        10,
        "require"
      )
    ).toContain("DATABASE_URL must be a PostgreSQL connection URL")
  })

  it("verifies the effective connected database identity", () => {
    expect(
      getDatabaseIdentityErrors(
        {
          databaseName: "lightning_accounts",
          schemaName: "public",
          userName: "lightning_accounts_app",
          ownerName: "lightning_accounts_app",
        },
        "lightning_accounts",
        "public",
        "lightning_accounts_app"
      )
    ).toEqual([])

    expect(
      getDatabaseIdentityErrors(
        {
          databaseName: "lightning_accounts",
          schemaName: "public",
          userName: "trucoshi_admin",
          ownerName: "lightning_accounts_app",
        },
        "lightning_accounts",
        "public",
        "lightning_accounts_app"
      )
    ).toContain("connected user must be lightning_accounts_app")
  })
})
