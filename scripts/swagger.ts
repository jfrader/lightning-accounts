import { writeFileSync } from "fs"
import specs from "../src/swaggerSpecs"

try {
  writeFileSync("./dist/swagger.json", JSON.stringify(specs))
} catch (e) {
  console.error("Failed to create swagger json file")
}
