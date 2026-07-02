const mockServices = {
  authService: {
    consumeMagicLink: jest.fn(),
    findMagicLinkUser: jest.fn(),
    loginUserWithEmailAndPassword: jest.fn(),
    registerUserWithMagicLink: jest.fn(),
    serializeAuthUser: jest.fn((user) => ({
      ...user,
      password: undefined,
      hasPassword: Boolean(user.password),
    })),
  },
  tokenService: {
    generateAuthTokens: jest.fn(),
    generateMagicLinkToken: jest.fn(),
  },
  emailService: {
    sendMagicLinkEmail: jest.fn(),
  },
  userService: {
    createUser: jest.fn(),
  },
}

jest.mock("../../src/services", () => mockServices)

import authController from "../../src/controllers/auth.controller"

const buildResponse = () => {
  const res: any = {}
  res.cookie = jest.fn(() => res)
  res.status = jest.fn(() => res)
  res.send = jest.fn(() => res)
  return res
}

const runHandler = async (handler: any, req: any, res: any) => {
  const next = jest.fn()
  handler(req, res, next)
  await new Promise((resolve) => setImmediate(resolve))
  expect(next).not.toHaveBeenCalled()
}

const runHandlerExpectError = async (handler: any, req: any, res: any) => {
  const next = jest.fn()
  handler(req, res, next)
  await new Promise((resolve) => setImmediate(resolve))
  expect(next).toHaveBeenCalled()
  return next.mock.calls[0][0]
}

describe("auth controller magic link flows", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockServices.tokenService.generateMagicLinkToken.mockResolvedValue("magic-token")
    mockServices.tokenService.generateAuthTokens.mockResolvedValue({
      access: { token: "access", expires: new Date() },
      refresh: { token: "refresh", expires: new Date() },
      identity: { token: "identity", expires: new Date() },
    })
  })

  it("registers an email user and sends a magic link", async () => {
    const user = { id: 1, email: "player@example.com", name: "Player", role: "USER" }
    mockServices.authService.registerUserWithMagicLink.mockResolvedValue(user)
    const res = buildResponse()

    await runHandler(
      authController.registerWithMagicLink,
      { body: { email: user.email, name: user.name } },
      res
    )

    expect(mockServices.authService.registerUserWithMagicLink).toHaveBeenCalledWith(
      user.email,
      user.name
    )
    expect(mockServices.tokenService.generateMagicLinkToken).toHaveBeenCalledWith(user)
    expect(mockServices.emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
      user.email,
      "magic-token"
    )
    expect(res.status).toHaveBeenCalledWith(204)
  })

  it("does not reveal missing users when requesting a magic login link", async () => {
    mockServices.authService.findMagicLinkUser.mockResolvedValue(null)
    const res = buildResponse()

    await runHandler(
      authController.loginWithMagicLink,
      { body: { email: "missing@example.com" } },
      res
    )

    expect(mockServices.tokenService.generateMagicLinkToken).not.toHaveBeenCalled()
    expect(mockServices.emailService.sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(204)
  })

  it("consumes a magic link and sets auth cookies", async () => {
    const user = { id: 1, email: "player@example.com", name: "Player", hasPassword: false }
    mockServices.authService.consumeMagicLink.mockResolvedValue(user)
    const res = buildResponse()

    await runHandler(authController.consumeMagicLink, { query: { token: "magic-token" } }, res)

    expect(mockServices.authService.consumeMagicLink).toHaveBeenCalledWith("magic-token")
    expect(mockServices.tokenService.generateAuthTokens).toHaveBeenCalledWith(user)
    expect(res.cookie).toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith({ user })
  })

  it("sends a profile magic link when password login is attempted without a password", async () => {
    const user = { id: 1, email: "player@example.com", password: null, role: "USER" }
    mockServices.authService.findMagicLinkUser.mockResolvedValue(user)
    const res = buildResponse()

    await runHandler(
      authController.login,
      { body: { email: user.email, password: "password1" } },
      res
    )

    expect(mockServices.authService.loginUserWithEmailAndPassword).not.toHaveBeenCalled()
    expect(mockServices.emailService.sendMagicLinkEmail).toHaveBeenCalledWith(
      user.email,
      "magic-token",
      "profile"
    )
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.send).toHaveBeenCalledWith({ magicLinkSent: true })
  })

  it("does not reveal missing users when password login is attempted", async () => {
    mockServices.authService.findMagicLinkUser.mockResolvedValue(null)
    const res = buildResponse()

    await runHandler(
      authController.login,
      { body: { email: "missing@example.com", password: "password1" } },
      res
    )

    expect(mockServices.authService.loginUserWithEmailAndPassword).not.toHaveBeenCalled()
    expect(mockServices.tokenService.generateMagicLinkToken).not.toHaveBeenCalled()
    expect(mockServices.emailService.sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.send).toHaveBeenCalledWith({ magicLinkSent: true })
  })

  it("does not send magic links to application users from password login", async () => {
    const user = { id: 1, email: "app@example.com", password: null, role: "APPLICATION" }
    mockServices.authService.findMagicLinkUser.mockResolvedValue(user)
    const res = buildResponse()

    await runHandler(
      authController.login,
      { body: { email: user.email, password: "password1" } },
      res
    )

    expect(mockServices.authService.loginUserWithEmailAndPassword).not.toHaveBeenCalled()
    expect(mockServices.tokenService.generateMagicLinkToken).not.toHaveBeenCalled()
    expect(mockServices.emailService.sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.send).toHaveBeenCalledWith({ magicLinkSent: true })
  })

  it("uses password login for users with a password", async () => {
    const passwordUser = {
      id: 1,
      email: "player@example.com",
      password: "hashed-password",
      role: "USER",
    }
    const safeUser = { id: 1, email: passwordUser.email, hasPassword: true }
    mockServices.authService.findMagicLinkUser.mockResolvedValue(passwordUser)
    mockServices.authService.loginUserWithEmailAndPassword.mockResolvedValue(safeUser)
    const res = buildResponse()

    await runHandler(
      authController.login,
      { body: { email: passwordUser.email, password: "password1" } },
      res
    )

    expect(mockServices.authService.loginUserWithEmailAndPassword).toHaveBeenCalledWith(
      passwordUser.email,
      "password1"
    )
    expect(mockServices.emailService.sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(mockServices.tokenService.generateAuthTokens).toHaveBeenCalledWith(safeUser)
    expect(res.send).toHaveBeenCalledWith({ user: safeUser })
  })

  it("does not convert bad password errors into magic links for password users", async () => {
    const passwordUser = {
      id: 1,
      email: "player@example.com",
      password: "hashed-password",
      role: "USER",
    }
    const error = new Error("Incorrect email or password")
    mockServices.authService.findMagicLinkUser.mockResolvedValue(passwordUser)
    mockServices.authService.loginUserWithEmailAndPassword.mockRejectedValue(error)
    const res = buildResponse()

    const receivedError = await runHandlerExpectError(
      authController.login,
      { body: { email: passwordUser.email, password: "wrongpass1" } },
      res
    )

    expect(receivedError).toBe(error)
    expect(mockServices.emailService.sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(mockServices.tokenService.generateMagicLinkToken).not.toHaveBeenCalled()
  })
})
