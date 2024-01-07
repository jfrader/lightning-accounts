import swaggerJSDoc from "swagger-jsdoc"
import swaggerDefinition from "./docs/swaggerDef"

const specs = swaggerJSDoc({
  swaggerDefinition,
  apis: ["dist/swagger.yml", "src/routes/v1/*.ts"],
})

export default specs
