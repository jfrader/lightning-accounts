import words from "./words/spanish.json"
import { randomInt } from "crypto"

export const getRandomWord = () => {
  const index = randomInt(0, words.length)
  return words[index]
}

export const getRecoveryPassword = (size = 5, divider = " ") => {
  return Array.from({ length: size })
    .map(() => getRandomWord())
    .join(divider)
}
