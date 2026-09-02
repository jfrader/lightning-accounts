const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}

const mockSendMail = jest.fn()
const mockVerify = jest.fn(() => Promise.resolve())
let mockTransportOptions: Record<string, unknown> | undefined

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: {
    email: {
      from: "noreply@example.com",
      smtp: {},
    },
    env: "development",
    origin: "http://localhost:5173",
  },
}))

jest.mock("../../src/config/logger", () => ({
  __esModule: true,
  default: mockLogger,
}))

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn((options: Record<string, unknown>) => {
      mockTransportOptions = options
      return {
        sendMail: mockSendMail,
        verify: mockVerify,
      }
    }),
  },
}))

import emailService from "../../src/services/email.service"

describe("email service", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerify.mockResolvedValue(undefined)
  })

  it("requires STARTTLS for SMTP submission", () => {
    expect(mockTransportOptions).toEqual({
      secure: false,
      requireTLS: true,
    })
  })

  it("does not log magic-link secrets in development", async () => {
    await emailService.sendMagicLinkEmail("player@example.com", "magic-token", "profile")

    expect(mockLogger.info).toHaveBeenCalledWith("Magic link email suppressed in development")
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain("player@example.com")
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain("magic-token")
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})
