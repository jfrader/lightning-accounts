import { readFileSync, writeFileSync } from "fs"
import jsonSchemaToOpenApi from "@openapi-contrib/json-schema-to-openapi-schema"
import schema from "../prisma/json-schema.json"
import YAML from "js-yaml"
import path from "path"
;(async () => {
  const convertedSchema = (await jsonSchemaToOpenApi(schema, {
    convertUnreferencedDefinitions: true,
    dereference: true,
    dereferenceOptions: { dereference: { circular: "ignore" } },
  })) as any

  const swaggerDocPath = path.join(__dirname, "../src/docs/components.yml")
  const swaggerDoc = YAML.load(readFileSync(swaggerDocPath, "utf8")) as any

  swaggerDoc.components = swaggerDoc.components || {}
  swaggerDoc.components.schemas = {
    ...swaggerDoc.components.schemas,
    ...convertedSchema.definitions,
  }

  const finalSwaggerPath = path.join(__dirname, "../dist/swagger.yml")
  writeFileSync(
    finalSwaggerPath,
    YAML.dump(swaggerDoc, {
      noRefs: true,
      replacer(key, value) {
        if (key === "$ref") {
          return value.replace("#/definitions/", "#/components/schemas/")
        }

        return value
      },
    })
  )

  try {
    writeFileSync("./dist/prisma.schema.json", JSON.stringify(convertedSchema))
  } catch (e) {
    console.error("Failed to create prisma schema json file")
  }
})()
