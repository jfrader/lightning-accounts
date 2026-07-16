import { Role } from "@prisma/client"
import { roleRights, UserPermission } from "../../src/config/roles"

describe("support feedback permissions", () => {
  it("grants feedback delivery only to application accounts", () => {
    expect(roleRights.get(Role.APPLICATION)).toContain(UserPermission.feedback_send)
    expect(roleRights.get(Role.USER)).not.toContain(UserPermission.feedback_send)
    expect(roleRights.get(Role.ADMIN)).not.toContain(UserPermission.feedback_send)
  })
})
