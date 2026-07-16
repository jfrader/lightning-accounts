import walletValidation from "../../src/validations/wallet.validation"

describe("wallet validation", () => {
  it.each([0, -1, 1.5])("rejects invalid payment amount %p", (amountInSats) => {
    const { error } = walletValidation.payUser.body.validate({ amountInSats, userId: 2 })
    expect(error).toBeDefined()
  })

  it("accepts a positive integer payment amount", () => {
    const { error } = walletValidation.payUser.body.validate({ amountInSats: 1, userId: 2 })
    expect(error).toBeUndefined()
  })

  it("rejects duplicate bulk payment-request receivers", () => {
    const { error } = walletValidation.createPayRequests.body.validate({
      amountInSats: 1,
      receiverIds: [2, 2],
    })
    expect(error).toBeDefined()
  })
})
