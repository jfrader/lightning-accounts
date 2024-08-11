import dotenv from "dotenv"
import { encryptPassword } from "../src/utils/encryption"
import path from "path"

dotenv.config({ path: path.join(process.cwd(), ".env") })
;(async () => {
  console.log(await encryptPassword(process.argv[2]))
})()
