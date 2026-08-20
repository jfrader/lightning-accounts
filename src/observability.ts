import { version as packageVersion } from "../package.json"
import {
  captureRequestError,
  createNodeObservability,
  readNodeEnv,
  type Observability,
} from "@jfrader/observability/dist/node/index.js"
import { createSentryNodeErrorReporter } from "@jfrader/observability/dist/providers/sentry-node.js"
import { captureException as captureSentryException } from "@sentry/node"

const APP_NAME = "lightning-accounts"
const APPLICATION_OWNED_PROCESS_INTEGRATIONS = new Set([
  "OnUncaughtException",
  "OnUnhandledRejection",
])
const FATAL_ERROR_MECHANISMS = {
  uncaughtException: "auto.node.onuncaughtexception",
  unhandledRejection: "auto.node.onunhandledrejection",
} as const

export type FatalErrorOrigin = keyof typeof FATAL_ERROR_MECHANISMS

const preserveApplicationProcessHandlers = <T extends { name: string }>(integrations: T[]) =>
  integrations.filter(({ name }) => !APPLICATION_OWNED_PROCESS_INTEGRATIONS.has(name))

const resolveEnvironment = (environment: NodeJS.ProcessEnv) =>
  environment.NODE_HOST?.includes(".testnet.")
    ? "testnet"
    : environment.NODE_ENV?.trim() || "development"

const resolveRelease = (environment: NodeJS.ProcessEnv) => {
  const version =
    environment.RENDER_GIT_COMMIT?.trim() || environment.RELEASE_SHA?.trim() || packageVersion
  return `${APP_NAME}@${version}`
}

export const createAppObservability = (
  environment: NodeJS.ProcessEnv = process.env,
  createErrorReporter: typeof createSentryNodeErrorReporter = createSentryNodeErrorReporter
): Observability => {
  const { sentryDsn } = readNodeEnv(environment)
  const appEnvironment = resolveEnvironment(environment)

  return createNodeObservability({
    appName: APP_NAME,
    environment: appEnvironment,
    ...(sentryDsn
      ? {
          errorReporter: createErrorReporter({
            dsn: sentryDsn,
            environment: appEnvironment,
            release: resolveRelease(environment),
            beforeSend(event) {
              delete event.request
              return event
            },
            initOptions: {
              integrations: preserveApplicationProcessHandlers,
            },
          }),
        }
      : {}),
  })
}

export const observability = createAppObservability()

export const createFatalExceptionCapture =
  (captureException: typeof captureSentryException = captureSentryException) =>
  (error: unknown, origin: FatalErrorOrigin) => {
    captureException(error, {
      originalException: error,
      captureContext: {
        level: "fatal",
        tags: { phase: "runtime" },
        ...(origin === "unhandledRejection" ? { extra: { unhandledPromiseRejection: true } } : {}),
      },
      mechanism: {
        handled: false,
        type: FATAL_ERROR_MECHANISMS[origin],
      },
    })
  }

export const captureFatalException = createFatalExceptionCapture()

export { captureRequestError }
