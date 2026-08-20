const mockInitializeApp = jest.fn()
const mockDisconnect = jest.fn()
const mockQueryRaw = jest.fn()
const mockSetReady = jest.fn()
const mockMonitorStart = jest.fn()
const mockMonitorStop = jest.fn()
const mockCreateReadinessMonitor = jest.fn()
const mockCaptureException = jest.fn()
const mockCaptureFatalException = jest.fn()
const mockFlush = jest.fn()
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
}

jest.mock("../../src/server", () => ({ initializeApp: mockInitializeApp }))
jest.mock("../../src/client", () => ({
  __esModule: true,
  default: { $disconnect: mockDisconnect, $queryRaw: mockQueryRaw },
}))
jest.mock("../../src/config/config", () => ({
  __esModule: true,
  default: { port: 3000 },
}))
jest.mock("../../src/config/logger", () => ({
  __esModule: true,
  default: mockLogger,
}))
jest.mock("../../src/health", () => ({ setReady: mockSetReady }))
jest.mock("../../src/readinessMonitor", () => ({
  createReadinessMonitor: mockCreateReadinessMonitor,
}))
jest.mock("../../src/observability", () => ({
  captureFatalException: mockCaptureFatalException,
  observability: { captureException: mockCaptureException, flush: mockFlush },
}))

import startServer from "../../src/index"

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

describe("server lifecycle", () => {
  let processOn: jest.SpiedFunction<typeof process.on>
  let processExit: jest.SpiedFunction<typeof process.exit>

  beforeEach(() => {
    jest.clearAllMocks()
    mockDisconnect.mockResolvedValue(undefined)
    mockFlush.mockResolvedValue(undefined)
    mockCreateReadinessMonitor.mockReturnValue({
      start: mockMonitorStart,
      stop: mockMonitorStop,
    })
    processOn = jest.spyOn(process, "on").mockImplementation((() => process) as typeof process.on)
    processExit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    processOn.mockRestore()
    processExit.mockRestore()
  })

  it("reports initialization failures and flushes before exiting", async () => {
    const startupError = new Error("database unavailable")
    mockInitializeApp.mockRejectedValue(startupError)

    startServer()
    await settle()

    expect(processOn).toHaveBeenCalledWith("uncaughtException", expect.any(Function))
    expect(processOn).toHaveBeenCalledWith("unhandledRejection", expect.any(Function))
    expect(processOn).toHaveBeenCalledWith("SIGTERM", expect.any(Function))
    expect(processOn).toHaveBeenCalledWith("SIGINT", expect.any(Function))
    expect(mockCaptureException).toHaveBeenCalledWith(startupError, {
      tags: { phase: "startup" },
    })
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockFlush).toHaveBeenCalledTimes(1)
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it("does not close a server that failed before listening", async () => {
    let bindErrorHandler: ((error: NodeJS.ErrnoException) => void) | undefined
    const close = jest.fn()
    const server = {
      listening: false,
      close,
      on: jest.fn(),
    }
    server.on.mockImplementation((event, handler) => {
      if (event === "error") {
        bindErrorHandler = handler
      }
      return server
    })
    mockInitializeApp.mockResolvedValue({
      listen: jest.fn(() => server),
    })

    startServer()
    await settle()
    const bindError = Object.assign(new Error("address in use"), { code: "EADDRINUSE" })
    bindErrorHandler?.(bindError)
    await settle()

    expect(close).not.toHaveBeenCalled()
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).toHaveBeenCalledWith(bindError, {
      tags: { phase: "startup" },
    })
    expect(mockFlush).toHaveBeenCalledTimes(1)
    expect(processExit).toHaveBeenCalledWith(1)
  })

  it("does not become ready or listen when shutdown wins the initialization race", async () => {
    let finishInitialization: ((app: { listen: jest.Mock }) => void) | undefined
    const listen = jest.fn()
    mockInitializeApp.mockReturnValue(
      new Promise((resolve) => {
        finishInitialization = resolve
      })
    )

    startServer()
    const sigtermHandler = processOn.mock.calls.find(([event]) => event === "SIGTERM")?.[1] as
      | (() => void)
      | undefined
    sigtermHandler?.()
    await settle()

    finishInitialization?.({ listen })
    await settle()

    expect(mockSetReady).toHaveBeenLastCalledWith(false)
    expect(mockCreateReadinessMonitor).not.toHaveBeenCalled()
    expect(mockMonitorStart).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
    expect(processExit).toHaveBeenCalledWith(0)
  })

  it.each(["uncaughtException", "unhandledRejection"] as const)(
    "owns %s failures, reports them as fatal, and flushes once",
    async (event) => {
      mockInitializeApp.mockReturnValue(new Promise(() => undefined))

      startServer()
      const handler = processOn.mock.calls.find(
        ([registeredEvent]) => registeredEvent === event
      )?.[1] as ((error: unknown) => void) | undefined
      const runtimeError = new Error(`${event} failure`)
      handler?.(runtimeError)
      await settle()

      expect(mockCaptureException).not.toHaveBeenCalled()
      expect(mockCaptureFatalException).toHaveBeenCalledTimes(1)
      expect(mockCaptureFatalException).toHaveBeenCalledWith(runtimeError, event)
      expect(mockFlush).toHaveBeenCalledTimes(1)
      expect(processExit).toHaveBeenCalledWith(1)
    }
  )
})
