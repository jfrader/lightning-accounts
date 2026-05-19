import { mapTwitterOAuth1Profile } from "../../src/config/passport/twitter.strategy"

describe("twitter OAuth 1.0a strategy", () => {
  it("maps the access-token exchange response into the existing profile shape", () => {
    expect(
      mapTwitterOAuth1Profile({
        user_id: "123",
        screen_name: "alice",
      })
    ).toMatchObject({
      provider: "twitter",
      id: "123",
      username: "alice",
      displayName: "alice",
      name: { givenName: "alice" },
      photos: [],
    })
  })
})
