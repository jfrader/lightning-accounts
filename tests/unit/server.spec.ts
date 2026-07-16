const mockConnect = jest.fn()
const mockApp = { name: "test-app" }

jest.mock("../../src/client", () => ({
  __esModule: true,
  default: { $connect: mockConnect },
}))

jest.mock("../../src/app", () => ({
  __esModule: true,
  default: mockApp,
}))

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: { wallet: { enabled: false } },
}))

jest.mock("../../src/config/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}))

jest.mock("../../src/services/lightning.service", () => ({
  __esModule: true,
  default: { initLightning: jest.fn() },
}))

jest.mock("../../src/services/wallet.service", () => ({
  __esModule: true,
  default: { checkInconsistentTransactions: jest.fn() },
}))

import { isReady, setReady } from "../../src/health"
import { initializeApp } from "../../src/server"

describe("server initialization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setReady(false)
  })

  it("does not report ready until Prisma connects", async () => {
    let finishConnecting: (() => void) | undefined
    mockConnect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishConnecting = resolve
        })
    )

    const initialization = initializeApp()

    expect(isReady()).toBe(false)
    finishConnecting?.()
    await expect(initialization).resolves.toBe(mockApp)
    expect(isReady()).toBe(true)
  })

  it("remains unavailable when Prisma cannot connect", async () => {
    mockConnect.mockRejectedValue(new Error("database unavailable"))

    await expect(initializeApp()).rejects.toThrow("database unavailable")
    expect(isReady()).toBe(false)
  })
})
