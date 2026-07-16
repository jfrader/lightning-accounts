const mockServices = {
  emailService: {
    sendEmail: jest.fn(),
  },
}

jest.mock("../../src/services", () => mockServices)

import supportController from "../../src/controllers/support.controller"

const buildResponse = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn(() => res)
  return res
}

const feedback = {
  message: "Me gustaria poder rematchear mas rapido",
  context: "match",
  matchSessionId: "mesa-sol-luna",
  author: {
    name: "Jugador",
    session: "guest-session",
    accountId: 42,
    accountEmail: "jugador@example.com",
  },
}

describe("support feedback controller", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockServices.emailService.sendEmail.mockResolvedValue({ messageId: "mail-1" })
  })

  it("sends feedback only to the authenticated application email", async () => {
    const res = buildResponse()
    const next = jest.fn()

    supportController.submitFeedback(
      {
        user: { email: "admin@trucoshi.com", role: "APPLICATION" },
        body: { ...feedback, recipient: "attacker@example.com" },
      } as any,
      res,
      next
    )
    await new Promise((resolve) => setImmediate(resolve))

    expect(next).not.toHaveBeenCalled()
    expect(mockServices.emailService.sendEmail).toHaveBeenCalledWith(
      "admin@trucoshi.com",
      "[Trucoshi] Nuevo comentario desde una partida",
      expect.stringContaining(feedback.message)
    )
    expect(mockServices.emailService.sendEmail.mock.calls[0][2]).toContain("Cuenta: 42")
    expect(mockServices.emailService.sendEmail.mock.calls[0][2]).not.toContain(
      "attacker@example.com"
    )
    expect(res.status).toHaveBeenCalledWith(204)
  })

  it("rejects non-application callers", async () => {
    const res = buildResponse()
    const next = jest.fn()

    supportController.submitFeedback(
      { user: { email: "player@example.com", role: "USER" }, body: feedback } as any,
      res,
      next
    )
    await new Promise((resolve) => setImmediate(resolve))

    expect(mockServices.emailService.sendEmail).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }))
  })

  it("propagates delivery failures without reporting success", async () => {
    const res = buildResponse()
    const next = jest.fn()
    const error = new Error("smtp unavailable")
    mockServices.emailService.sendEmail.mockRejectedValue(error)

    supportController.submitFeedback(
      { user: { email: "admin@trucoshi.com", role: "APPLICATION" }, body: feedback } as any,
      res,
      next
    )
    await new Promise((resolve) => setImmediate(resolve))

    expect(next).toHaveBeenCalledWith(error)
    expect(res.status).not.toHaveBeenCalled()
  })
})
