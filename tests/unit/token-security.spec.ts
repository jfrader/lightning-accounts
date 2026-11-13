const mockPrisma = {
  token: { create: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock("../../src/client", () => ({ __esModule: true, default: mockPrisma }))
jest.mock("../../src/utils/encryption", () => ({
  encryptPassword: jest.fn(async (password: string) => `hashed-${password}`),
  isPasswordMatch: jest.fn(async () => true),
}))

import moment from "moment"
import { TokenType } from "@prisma/client"
import tokenService, { digestToken, revokeSecurityTokens } from "../../src/services/token.service"
import authService from "../../src/services/auth.service"
import userService from "../../src/services/user.service"

describe("stored credentials", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))
  })

  it.each([
    TokenType.REFRESH,
    TokenType.MAGIC_LINK,
    TokenType.RESET_PASSWORD,
    TokenType.VERIFY_EMAIL,
  ])("stores only a digest for %s", async (type) => {
    const expires = moment().add(10, "minutes")
    const token = tokenService.generateToken(7, expires, type)
    await tokenService.saveToken(token, 7, expires, type)
    expect(mockPrisma.token.create).toHaveBeenCalledWith({
      data: {
        tokenDigest: digestToken(token),
        userId: 7,
        expires: expires.toDate(),
        type,
        blacklisted: false,
      },
    })
    expect(JSON.stringify(mockPrisma.token.create.mock.calls)).not.toContain(token)
    expect(digestToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it("verifies a signed token against its digest and rejects a different token", async () => {
    const token = tokenService.generateToken(7, moment().add(10, "minutes"), TokenType.MAGIC_LINK)
    mockPrisma.token.findFirst.mockImplementation(async ({ where }) =>
      where.tokenDigest === digestToken(token) ? { id: 3, userId: 7 } : null
    )
    await expect(tokenService.verifyToken(token, TokenType.MAGIC_LINK)).resolves.toMatchObject({
      id: 3,
    })
    expect(mockPrisma.token.findFirst).toHaveBeenCalledWith({
      where: {
        tokenDigest: digestToken(token),
        type: TokenType.MAGIC_LINK,
        userId: 7,
        blacklisted: false,
        expires: { gt: expect.any(Date) },
      },
    })
    const other = tokenService.generateToken(7, moment().add(10, "minutes"), TokenType.MAGIC_LINK)
    await expect(tokenService.verifyToken(other, TokenType.MAGIC_LINK)).rejects.toThrow(
      "Token not found"
    )
    await expect(tokenService.verifyToken(token, TokenType.REFRESH)).rejects.toThrow(
      "Invalid token type"
    )
    await expect(
      tokenService.verifyToken(`${token}tampered`, TokenType.MAGIC_LINK)
    ).rejects.toThrow()
  })

  it("centralizes revocation of refresh and outstanding login/recovery links", async () => {
    await revokeSecurityTokens(7)
    expect(mockPrisma.token.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        type: { in: ["REFRESH", "MAGIC_LINK", "RESET_PASSWORD", "VERIFY_EMAIL"] },
      },
    })
  })

  it("logs out all stored credentials for the verified refresh-token owner", async () => {
    const token = tokenService.generateToken(7, moment().add(10, "minutes"), TokenType.REFRESH)
    mockPrisma.token.findFirst.mockResolvedValue({ id: 3, userId: 7 })
    await authService.logout(token)
    expect(mockPrisma.token.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        type: { in: expect.arrayContaining(["MAGIC_LINK", "REFRESH", "RESET_PASSWORD"]) },
      },
    })
  })

  it.each([{ password: "new-password" }, { email: "new@example.com" }])(
    "revokes outstanding links inside a credential-update transaction: %j",
    async (update) => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 7, email: "old@example.com" })
      if (update.email)
        mockPrisma.user.findUnique
          .mockResolvedValueOnce({ id: 7, email: "old@example.com" })
          .mockResolvedValueOnce(null)
      mockPrisma.user.update.mockResolvedValue({ id: 7 })
      await userService.updateUserById(7, update, ["id"], false)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.token.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 7,
          type: { in: expect.arrayContaining(["MAGIC_LINK", "REFRESH", "RESET_PASSWORD"]) },
        },
      })
    }
  )

  it("password reset revokes magic links after atomic reset-token consumption", async () => {
    const { encryptPassword } = await import("../../src/utils/encryption")
    jest.mocked(encryptPassword).mockResolvedValue("hashed-new-password")
    const token = tokenService.generateToken(
      7,
      moment().add(10, "minutes"),
      TokenType.RESET_PASSWORD
    )
    mockPrisma.token.findFirst.mockResolvedValue({ id: 3, userId: 7 })
    mockPrisma.token.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7, password: "hashed-new-password" })
    mockPrisma.user.update.mockResolvedValue({ id: 7 })
    await authService.resetPassword(token, "new-password")
    expect(mockPrisma.token.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: 3, type: "RESET_PASSWORD", blacklisted: false },
    })
    expect(mockPrisma.token.deleteMany).toHaveBeenLastCalledWith({
      where: {
        userId: 7,
        type: { in: expect.arrayContaining(["MAGIC_LINK", "REFRESH", "RESET_PASSWORD"]) },
      },
    })
  })

  it("rejects a magic-link replay before verifying the user or issuing auth tokens", async () => {
    const token = tokenService.generateToken(7, moment().add(10, "minutes"), TokenType.MAGIC_LINK)
    mockPrisma.token.findFirst.mockResolvedValue({ id: 3, userId: 7 })
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7, role: "USER" })
    mockPrisma.token.deleteMany.mockResolvedValue({ count: 0 })
    await expect(authService.consumeMagicLink(token)).rejects.toThrow("Magic link login failed")
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })
})
