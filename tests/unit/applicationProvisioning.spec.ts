import { Role } from "@prisma/client"
import { provisionApplicationServiceAccount } from "../../src/services/applicationProvisioning"
import { encryptPassword, isPasswordMatch } from "../../src/utils/encryption"

jest.mock("../../src/utils/encryption", () => ({
  encryptPassword: jest.fn(async (password: string) => `hashed:${password}`),
  isPasswordMatch: jest.fn(async () => false),
}))

const email = "game@trucoshi.com"
const password = "a-secure-test-service-password-value-12345"

describe("application service-account provisioning", () => {
  const user = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  }
  const prisma = { user } as any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(isPasswordMatch).mockResolvedValue(false)
  })

  it("creates a verified APPLICATION account with a disabled empty wallet", async () => {
    user.findUnique.mockResolvedValue(null)
    user.create.mockResolvedValue({ id: 1, email, name: "Trucoshi Game", role: Role.APPLICATION })

    await provisionApplicationServiceAccount({
      prisma,
      email,
      password,
      allowedEmails: email,
    })

    expect(encryptPassword).toHaveBeenCalledWith(password)
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email,
          isEmailVerified: true,
          role: Role.APPLICATION,
          wallet: { create: { balanceInSats: 0, disabled: true } },
        }),
      })
    )
  })

  it("updates an existing APPLICATION without changing its wallet balance or busy state", async () => {
    user.findUnique.mockResolvedValue({
      id: 7,
      email,
      password: "old-hash",
      role: Role.APPLICATION,
    })
    user.update.mockResolvedValue({ id: 7, email, name: "Trucoshi Game", role: Role.APPLICATION })

    await provisionApplicationServiceAccount({
      prisma,
      email,
      password,
      allowedEmails: `another@trucoshi.com, ${email}`,
    })

    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          wallet: {
            upsert: {
              create: { balanceInSats: 0, disabled: true },
              update: { disabled: true },
            },
          },
        }),
      })
    )
    expect(user.update.mock.calls[0][0].data.wallet.upsert.update).not.toHaveProperty(
      "balanceInSats"
    )
    expect(user.update.mock.calls[0][0].data.wallet.upsert.update).not.toHaveProperty("busy")
    expect(encryptPassword).toHaveBeenCalledWith(password)
  })

  it("does not rehash an already matching password on repeated provisioning", async () => {
    user.findUnique.mockResolvedValue({
      id: 7,
      email,
      password: "current-hash",
      role: Role.APPLICATION,
    })
    user.update.mockResolvedValue({ id: 7, email, name: "Trucoshi Game", role: Role.APPLICATION })
    jest.mocked(isPasswordMatch).mockResolvedValue(true)

    await provisionApplicationServiceAccount({ prisma, email, password, allowedEmails: email })

    expect(isPasswordMatch).toHaveBeenCalledWith(password, "current-hash")
    expect(encryptPassword).not.toHaveBeenCalled()
    expect(user.update.mock.calls[0][0].data).not.toHaveProperty("password")
  })

  it.each([Role.USER, Role.ADMIN])("refuses to overwrite a %s human account", async (role) => {
    user.findUnique.mockResolvedValue({ id: 9, email, password: "human-hash", role })

    await expect(
      provisionApplicationServiceAccount({ prisma, email, password, allowedEmails: email })
    ).rejects.toThrow("Refusing to replace non-APPLICATION user")
    expect(user.update).not.toHaveBeenCalled()
  })

  it("requires the provisioned email to be explicitly allowlisted", async () => {
    await expect(
      provisionApplicationServiceAccount({
        prisma,
        email,
        password,
        allowedEmails: "another@trucoshi.com",
      })
    ).rejects.toThrow("must be present in APPLICATION_EMAILS")
    expect(user.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    "short",
    "replace-with-a-long-placeholder-password-value",
    "                                ",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ])("rejects weak or placeholder service passwords", async (weakPassword) => {
    await expect(
      provisionApplicationServiceAccount({
        prisma,
        email,
        password: weakPassword,
        allowedEmails: email,
      })
    ).rejects.toThrow("must be a non-placeholder secret of at least 32 characters")
    expect(user.findUnique).not.toHaveBeenCalled()
  })

  it("normalizes the fixed service email before checking its allowlist", async () => {
    user.findUnique.mockResolvedValue(null)
    user.create.mockResolvedValue({ id: 1, email, name: "Trucoshi Game", role: Role.APPLICATION })

    await provisionApplicationServiceAccount({
      prisma,
      email: " GAME@TRUCOSHI.COM ",
      password,
      allowedEmails: " Game@Trucoshi.com ",
    })

    expect(user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email } }))
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email }) })
    )
  })
})
