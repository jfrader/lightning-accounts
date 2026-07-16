import bcrypt from "bcryptjs"
import config from "../config/config"

export const encryptPassword = async (password: string) => {
  const encryptedPassword = await bcrypt.hash(password, config.bcryptRounds)
  return encryptedPassword
}

export const isPasswordMatch = async (password: string, userPassword: string) => {
  return bcrypt.compare(password, userPassword)
}
