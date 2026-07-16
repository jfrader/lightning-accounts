const userSelect = expect.objectContaining({
  id: true,
  nostrPubkey: true,
  password: true,
})

const findUnique = jest.fn()
const create = jest.fn()
const update = jest.fn()

jest.mock("../../src/client", () => ({
  __esModule: true,
  default: {
    user: { findUnique, create, update },
  },
}))

jest.mock("nostr-tools", () => ({
  nip98: {
    unpackEventFromToken: jest.fn(),
    validateToken: jest.fn(),
  },
}))

import { resolveNostrUser } from "../../src/config/passport/nostr.strategy"

const buildUser = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  email: "player@example.com",
  twitter: null,
  avatarUrl: null,
  nostrPubkey: "public-key",
  name: "Player",
  role: "USER",
  hasSeed: false,
  password: null,
  ...overrides,
})

describe("Nostr account resolution", () => {
  beforeEach(() => {
    findUnique.mockReset()
    create.mockReset()
    update.mockReset()
  })

  it("connects a new Nostr public key to the authenticated account", async () => {
    const connectedUser = buildUser()
    findUnique.mockResolvedValue(null)
    update.mockResolvedValue(connectedUser)

    await expect(resolveNostrUser("public-key", { id: 7 })).resolves.toEqual(connectedUser)

    expect(findUnique).toHaveBeenCalledWith({
      where: { nostrPubkey: "public-key" },
      select: userSelect,
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { nostrPubkey: "public-key" },
      select: userSelect,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("keeps an existing Nostr login attached to the same account", async () => {
    const connectedUser = buildUser()
    findUnique.mockResolvedValue(connectedUser)

    await expect(resolveNostrUser("public-key", { id: 7 })).resolves.toEqual(connectedUser)

    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses to move a Nostr public key from another account", async () => {
    findUnique.mockResolvedValue(buildUser({ id: 22 }))

    await expect(resolveNostrUser("public-key", { id: 7 })).rejects.toThrow(
      "Nostr public key is already connected to another account"
    )

    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
