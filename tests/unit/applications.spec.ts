import path from "node:path"
import {
  isApplicationSourceAllowed,
  loadApplications,
  parseApplicationCredential,
  resolveApplicationAuthorization,
} from "../../src/config/applications"

describe("application config", () => {
  it("does not require an ignored applications.json file", () => {
    const missingPath = path.join(process.cwd(), "does-not-exist", "applications.json")

    expect(loadApplications(missingPath)).toEqual([])
  })

  it("keeps colons inside a strong application password", () => {
    expect(parseApplicationCredential("game@example.com:part:two:three")).toEqual({
      email: "game@example.com",
      token: "part:two:three",
    })
  })

  it.each(["", "missing-separator", ":password", "game@example.com:"])(
    "rejects malformed application credential %p",
    (credential) => {
      expect(() => parseApplicationCredential(credential)).toThrow(
        "Invalid application credentials"
      )
    }
  )

  it("allows an environment-listed application without an address restriction", () => {
    const authorization = resolveApplicationAuthorization(
      "game@example.com",
      ["game@example.com"],
      []
    )

    expect(authorization).toEqual({ allowed: true, allowedAddresses: [] })
    expect(isApplicationSourceAllowed("dynamic-cloud-address", authorization)).toBe(true)
  })

  it("rejects an email that is absent from both allowlists", () => {
    const authorization = resolveApplicationAuthorization("unknown@example.com", [], [])

    expect(authorization.allowed).toBe(false)
    expect(isApplicationSourceAllowed("127.0.0.1", authorization)).toBe(false)
  })

  it("keeps the legacy file allowlist and its address restriction", () => {
    const authorization = resolveApplicationAuthorization(
      "legacy@example.com",
      [],
      [{ email: "legacy@example.com", remoteAddress: "10.0.0.5" }]
    )

    expect(isApplicationSourceAllowed("10.0.0.5", authorization)).toBe(true)
    expect(isApplicationSourceAllowed("10.0.0.6", authorization)).toBe(false)
  })

  it("enforces APPLICATION_ADDRESS for an environment-listed application", () => {
    const authorization = resolveApplicationAuthorization(
      "game@example.com",
      ["game@example.com"],
      [],
      "10.0.0.8"
    )

    expect(isApplicationSourceAllowed("10.0.0.8", authorization)).toBe(true)
    expect(isApplicationSourceAllowed("10.0.0.9", authorization)).toBe(false)
  })

  it("accepts either configured address when legacy and global restrictions coexist", () => {
    const authorization = resolveApplicationAuthorization(
      "legacy@example.com",
      [],
      [{ email: "legacy@example.com", remoteAddress: "10.0.0.5" }],
      "10.0.0.8"
    )

    expect(isApplicationSourceAllowed("10.0.0.5", authorization)).toBe(true)
    expect(isApplicationSourceAllowed("10.0.0.8", authorization)).toBe(true)
  })
})
