import authValidation from "../../src/validations/auth.validation"
import userValidation from "../../src/validations/user.validation"
import { withoutForbiddenNameCharacters } from "../../src/utils/string/names"

describe("name validation", () => {
  it.each(["{{team}}", "Fran}", "{Fran"])("rejects names with braces: %p", (name) => {
    expect(authValidation.registerWithSeed.body.validate({ name }).error).toBeDefined()
    expect(
      authValidation.magicLinkRegister.body.validate({ name, email: "a@b.co" }).error
    ).toBeDefined()
    expect(userValidation.updateUser.body.validate({ name }).error).toBeDefined()
  })

  it("accepts a plain name", () => {
    expect(
      authValidation.registerWithSeed.body.validate({ name: "Fran (2)" }).error
    ).toBeUndefined()
  })

  it("strips braces from a name", () => {
    expect(withoutForbiddenNameCharacters("{{Fran}}")).toBe("Fran")
  })
})
