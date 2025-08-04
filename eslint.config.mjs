import { defineConfig, globalIgnores } from "eslint/config"
import tsParser from "@typescript-eslint/parser"
import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default defineConfig([
  globalIgnores(["**/node_modules", "**/bin", "**/build", "**/dist", "**/volumes", "**/scripts"]),
  {
    extends: compat.extends("plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"),

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: "module",
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
])
