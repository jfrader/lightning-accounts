const mockUserService = {
  createUserWithEmail: jest.fn(),
  getUserByEmail: jest.fn(),
}

jest.mock("../../src/services/user.service", () => ({
  __esModule: true,
  default: mockUserService,
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
