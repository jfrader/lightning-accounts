import type { NextFunction, Request, Response } from "express"

const mockGetUserWallet = jest.fn((_req: Request, res: Response) => res.status(200).send())

jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: { wallet: { enabled: false } },
}))

jest.mock("../../src/middlewares/auth", () => ({
  __esModule: true,
  default: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}))

jest.mock("../../src/middlewares/validate", () => ({
  __esModule: true,
  default: jest.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
}))

jest.mock("../../src/controllers", () => ({
  userController: {
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    getUser: jest.fn(),
    getUserWallet: mockGetUserWallet,
    getUsers: jest.fn(),
    updateUser: jest.fn(),
  },
}))

jest.mock("../../src/validations", () => ({
  userValidation: {
    createUser: {},
    deleteUser: {},
    getUser: {},
    getUsers: {},
    updateUser: {},
  },
}))

import express from "express"
import request from "supertest"
import userRoutes from "../../src/routes/v1/user.route"

describe("user wallet route with wallet functionality off", () => {
  it("does not mount the wallet read endpoint", async () => {
    const app = express().use("/users", userRoutes)

    await request(app).get("/users/1/wallet").expect(404)
    expect(mockGetUserWallet).not.toHaveBeenCalled()
  })
})
