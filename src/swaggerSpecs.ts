import swaggerJSDoc from "swagger-jsdoc"
import swaggerDefinition from "./docs/swaggerDef"
import { writeFileSync } from "fs"

const specs = swaggerJSDoc({
  swaggerDefinition,
  apis: ["src/docs/*.yml", "src/routes/v1/*.ts"],
})

try {
  writeFileSync("./dist/swagger.json", JSON.stringify(specs))
} catch (e) {
  console.error("Failed to create swagger json file")
}

export default specs
