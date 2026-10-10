import authValidation from "../../src/validations/auth.validation"
import userValidation from "../../src/validations/user.validation"
import { withoutForbiddenNameCharacters } from "../../src/utils/string/names"
import { getMagicLinkRegistrationName } from "../../src/services/auth.service"

describe("name validation", () => {
  it.each(["{{team}}", "Fran}", "{Fran"])("rejects names with braces: %p", (name) => {
    expect(authValidation.registerWithSeed.body.validate({ name }).error).toBeDefined()
    expect(
      authValidation.magicLinkRegister.body.validate({ name, email: "a@b.co" }).error
    ).toBeDefined()
    expect(userValidation.updateUser.body.validate({ name }).error?.message).toBe(
      "name must not contain braces"
    )
  })

  it("accepts a plain name", () => {
    expect(
      authValidation.registerWithSeed.body.validate({ name: "Fran (2)" }).error
    ).toBeUndefined()
  })

  it("drops braces from a magic-link name taken from the email", () => {
    expect(getMagicLinkRegistrationName("{{team}}@example.com")).toBe("team")
    expect(getMagicLinkRegistrationName("{}@example.com")).toBe("jugador")
  })

  it("strips braces from a name", () => {
    expect(withoutForbiddenNameCharacters("{{Fran}}")).toBe("Fran")
  })
})
