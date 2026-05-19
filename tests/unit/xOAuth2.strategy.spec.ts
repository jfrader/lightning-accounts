import axios from "axios"
import {
  buildXOAuth2StrategyOptions,
  mapXProfile,
  XOAuth2Strategy,
  X_USER_PROFILE_FALLBACK_URLS,
  X_USER_PROFILE_URL,
} from "../../src/config/passport/xOAuth2.strategy"

jest.mock("axios")

const mockedAxios = axios as jest.Mocked<typeof axios>

describe("XOAuth2Strategy", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("maps an X user profile into the existing Twitter profile shape", () => {
    expect(
      mapXProfile({
        id: "123",
        username: "alice",
        name: "Alice",
        profile_image_url: "https://x.com/alice.jpg",
        url: "https://x.com/alice",
      })
    ).toEqual({
      provider: "twitter",
      id: "123",
      username: "alice",
      displayName: "Alice",
      name: { givenName: "Alice" },
      profileUrl: "https://x.com/alice",
      photos: [{ value: "https://x.com/alice.jpg" }],
      _json: {
        id: "123",
        username: "alice",
        name: "Alice",
        profile_image_url: "https://x.com/alice.jpg",
        url: "https://x.com/alice",
      },
    })
  })

  it("fetches profiles from the X users/me endpoint", async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: {
          id: "123",
          username: "alice",
          name: "Alice",
          profile_image_url: "https://x.com/alice.jpg",
        },
      },
    })

    const strategy = new XOAuth2Strategy(
      {
        callbackURL: "http://localhost/v1/auth/twitter/callback",
        clientID: "client-id",
        clientSecret: "client-secret",
        clientType: "public",
        passReqToCallback: true,
      },
      jest.fn() as any
    )

    const profile = await new Promise((resolve, reject) => {
      strategy.userProfile("access-token", (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result)
      })
    })

    expect(mockedAxios.get).toHaveBeenCalledWith(X_USER_PROFILE_URL, {
      headers: { Authorization: "Bearer access-token" },
    })
    expect(profile).toMatchObject({
      provider: "twitter",
      id: "123",
      username: "alice",
      displayName: "Alice",
      photos: [{ value: "https://x.com/alice.jpg" }],
    })
  })

  it("falls back when the x.com profile endpoint rejects the request", async () => {
    mockedAxios.get
      .mockRejectedValueOnce({
        response: {
          status: 403,
          data: {
            errors: [{ detail: "Check App permissions" }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            id: "123",
            username: "alice",
            name: "Alice",
          },
        },
      })

    const strategy = new XOAuth2Strategy(
      {
        callbackURL: "http://localhost/v1/auth/twitter/callback",
        clientID: "client-id",
        clientSecret: "client-secret",
        clientType: "public",
        passReqToCallback: true,
      },
      jest.fn() as any
    )

    const profile = await new Promise((resolve, reject) => {
      strategy.userProfile("access-token", (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result)
      })
    })

    expect(mockedAxios.get).toHaveBeenNthCalledWith(1, X_USER_PROFILE_URL, {
      headers: { Authorization: "Bearer access-token" },
    })
    expect(mockedAxios.get).toHaveBeenNthCalledWith(2, X_USER_PROFILE_FALLBACK_URLS[0], {
      headers: { Authorization: "Bearer access-token" },
    })
    expect(profile).toMatchObject({
      provider: "twitter",
      id: "123",
      username: "alice",
      displayName: "Alice",
    })
  })

  it("uses Basic auth for confidential clients", () => {
    const options = buildXOAuth2StrategyOptions({
      callbackURL: "http://localhost/v1/auth/twitter/callback",
      clientID: "client-id",
      clientSecret: "client-secret",
      clientType: "confidential",
      passReqToCallback: true,
    })

    expect(options.pkce).toBe(true)
    expect(options.state).toBe(true)
    expect(options.customHeaders?.Authorization).toBe("Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=")
  })
})
