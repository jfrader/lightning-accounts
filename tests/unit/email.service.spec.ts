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

  it("logs magic links in development without sending email", async () => {
    await emailService.sendMagicLinkEmail("player@example.com", "magic-token", "profile")

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Magic link for player@example.com: http://localhost:5173/magic-link?token=magic-token&next=profile"
    )
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})
