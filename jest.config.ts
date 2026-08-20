module.exports = {
  preset: "ts-jest",
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  transformIgnorePatterns: ["/node_modules/(?!@jfrader/observability/)"],
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  testEnvironment: "node",
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  restoreMocks: true,
  coveragePathIgnorePatterns: ["node_modules", "src/config", "src/app.ts", "tests"],
  coverageReporters: ["text", "lcov", "clover", "html"],
  // Add if needed to match test file location
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.spec.ts"], // Matches your transactions.spec.ts
  // globalSetup: "<rootDir>/tests/setup.ts",
  globalTeardown: "<rootDir>/tests/teardown.ts",
}
