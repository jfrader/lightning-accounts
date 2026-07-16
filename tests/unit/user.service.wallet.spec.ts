const mockConfig = {
  seedHashSecret: "test-seed-secret",
  wallet: { enabled: false },
}

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: mockConfig,
}))

jest.mock("../../src/client", () => ({
  __esModule: true,
  default: {},
}))

jest.mock("../../src/services/auth.service", () => ({
  __esModule: true,
  default: {},
}))

import { getNewWalletData } from "../../src/services/user.service"

describe("new user wallet defaults", () => {
  it("creates a disabled wallet when wallet functionality is off", () => {
    mockConfig.wallet.enabled = false

    expect(getNewWalletData()).toEqual({ balanceInSats: 0, disabled: true })
  })

  it("preserves the enabled wallet default when wallet functionality is on", () => {
    mockConfig.wallet.enabled = true

    expect(getNewWalletData()).toEqual({ balanceInSats: 0, disabled: false })
  })
})
