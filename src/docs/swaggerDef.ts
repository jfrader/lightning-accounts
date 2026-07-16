import { name, version, repository } from "../../package.json"

const port = process.env.PORT ?? process.env.NODE_PORT ?? "3000"

const swaggerDef = {
  openapi: "3.0.0",
  info: {
    title: `${name} API documentation`,
    version,
    license: {
      name: "MIT",
      url: repository,
    },
  },
  servers: [
    {
      url: `http://localhost:${port}/v1`,
    },
  ],
}

export default swaggerDef
