import type { ErrorEvent } from "@sentry/node"
import type { SentryNodeConfig } from "@jfrader/observability/dist/providers/sentry-node.js"
import { createAppObservability, createFatalExceptionCapture } from "../../src/observability"

const createReporter = (captureException: jest.Mock) => ({
  captureException,
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
})

describe("observability", () => {
  it("captures configured errors with stable testnet and release names", () => {
    const captureException = jest.fn()
    const createErrorReporter = jest.fn((_config: SentryNodeConfig) =>
      createReporter(captureException)
    )
    const configured = createAppObservability(
      {
        NODE_ENV: "production",
        NODE_HOST: "https://accounts.testnet.trucoshi.com",
        RELEASE_SHA: "0123456789abcdef",
        SENTRY_DSN: "https://public@example.invalid/1",
      },
      createErrorReporter
    )
    const error = new Error("configured failure")

    configured.captureException(error)

    expect(configured.appName).toBe("lightning-accounts")
    expect(configured.environment).toBe("testnet")
    expect(captureException).toHaveBeenCalledWith(error, undefined)
    expect(createErrorReporter).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.invalid/1",
        environment: "testnet",
        release: "lightning-accounts@0123456789abcdef",
      })
    )

    const sentryConfig = createErrorReporter.mock.calls[0][0]
    const event = {
      type: undefined,
      request: {
        data: { password: "not-for-sentry" },
        headers: { authorization: "Bearer not-for-sentry" },
      },
    } as ErrorEvent

    expect(sentryConfig.beforeSend?.(event)).toBe(event)
    expect(event.request).toBeUndefined()

    const filterIntegrations = sentryConfig.initOptions?.integrations as
      | ((integrations: Array<{ name: string }>) => Array<{ name: string }>)
      | undefined
    const httpIntegration = { name: "Http" }
    expect(
      filterIntegrations?.([
        { name: "OnUncaughtException" },
        httpIntegration,
        { name: "OnUnhandledRejection" },
      ])
    ).toEqual([httpIntegration])
  })

  it("stays inert when Sentry is not configured", async () => {
    const createErrorReporter = jest.fn((_config: SentryNodeConfig) => createReporter(jest.fn()))
    const unconfigured = createAppObservability(
      { NODE_ENV: "test", SENTRY_DSN: "" },
      createErrorReporter
    )

    expect(() => unconfigured.captureException(new Error("ignored"))).not.toThrow()
    await expect(unconfigured.flush()).resolves.toBeUndefined()
    expect(createErrorReporter).not.toHaveBeenCalled()
  })

  it.each([
    ["uncaughtException", "auto.node.onuncaughtexception", undefined],
    ["unhandledRejection", "auto.node.onunhandledrejection", { unhandledPromiseRejection: true }],
  ] as const)("captures %s as a fatal unhandled event", (origin, mechanismType, extra) => {
    const captureException = jest.fn(() => "event-id")
    const captureFatalException = createFatalExceptionCapture(captureException)
    const error = new Error(`${origin} failure`)

    captureFatalException(error, origin)

    expect(captureException).toHaveBeenCalledWith(error, {
      originalException: error,
      captureContext: {
        level: "fatal",
        tags: { phase: "runtime" },
        ...(extra ? { extra } : {}),
      },
      mechanism: {
        handled: false,
        type: mechanismType,
      },
    })
  })
})
