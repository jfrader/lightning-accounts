const mockUserService = {
  createUserWithEmail: jest.fn(),
  getUserByEmail: jest.fn(),
}

const mockTokenService = {
  verifyToken: jest.fn(),
  generateAuthTokens: jest.fn(),
}

const mockPrisma = {
  token: {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}

jest.mock("../../src/services/user.service", () => ({
  __esModule: true,
  default: mockUserService,
}))

jest.mock("../../src/services/token.service", () => ({
  __esModule: true,
  default: mockTokenService,
}))

jest.mock("../../src/client", () => ({
  __esModule: true,
  default: mockPrisma,
}))

import { Prisma } from "@prisma/client"
import httpStatus from "http-status"
import authService, { getMagicLinkRegistrationName } from "../../src/services/auth.service"
import ApiError from "../../src/utils/ApiError"

describe("auth service magic link registration", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("uses the email prefix as the default registration name", () => {
    expect(getMagicLinkRegistrationName("player@example.com")).toBe("player")
  })

  it("truncates the default registration name to the user name limit", () => {
    expect(getMagicLinkRegistrationName("averyverylongplayer@example.com")).toBe("averyverylongpla")
  })

  it("creates missing magic-link users with the default registration name", async () => {
    const user = { id: 1, email: "player@example.com", name: "player", role: "USER" }
    mockUserService.getUserByEmail.mockResolvedValue(null)
    mockUserService.createUserWithEmail.mockResolvedValue(user)

    await expect(authService.getOrCreateMagicLinkUser(user.email)).resolves.toBe(user)

    expect(mockUserService.createUserWithEmail).toHaveBeenCalledWith(user.email, "player")
  })

  it("refetches the user when creation hits a Prisma duplicate email race", async () => {
    const user = { id: 1, email: "player@example.com", name: "player", role: "USER" }
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      { code: "P2002", clientVersion: "test" }
    )
    mockUserService.getUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user)
    mockUserService.createUserWithEmail.mockRejectedValue(duplicateError)

    await expect(authService.getOrCreateMagicLinkUser(user.email)).resolves.toBe(user)
  })

  it("refetches the user when creation sees an existing email during its precheck", async () => {
    const user = { id: 1, email: "player@example.com", name: "player", role: "USER" }
    mockUserService.getUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user)
    mockUserService.createUserWithEmail.mockRejectedValue(
      new ApiError(httpStatus.BAD_REQUEST, "Email already taken")
    )

    await expect(authService.getOrCreateMagicLinkUser(user.email)).resolves.toBe(user)
  })
})

describe("auth service refresh rotation", () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it("consumes a refresh token before issuing its replacement", async () => {
    const tokens = { access: { token: "access" }, refresh: { token: "next" } }
    mockTokenService.verifyToken.mockResolvedValue({ id: 10, userId: 1 })
    mockPrisma.token.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.token.deleteMany.mockResolvedValue({ count: 0 })
    mockTokenService.generateAuthTokens.mockResolvedValue(tokens)

    await expect(authService.refreshAuth("refresh")).resolves.toBe(tokens)

    expect(mockPrisma.token.updateMany).toHaveBeenCalledWith({
      where: { id: 10, type: "REFRESH", blacklisted: false },
      data: { blacklisted: true },
    })
    expect(mockPrisma.token.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockTokenService.generateAuthTokens.mock.invocationCallOrder[0]
    )
  })

  it("rejects a replayed refresh token", async () => {
    mockTokenService.verifyToken.mockResolvedValue({ id: 10, userId: 1 })
    mockPrisma.token.updateMany.mockResolvedValue({ count: 0 })

    await expect(authService.refreshAuth("refresh")).rejects.toMatchObject({
      statusCode: httpStatus.FORBIDDEN,
    })
    expect(mockTokenService.generateAuthTokens).not.toHaveBeenCalled()
  })
})
