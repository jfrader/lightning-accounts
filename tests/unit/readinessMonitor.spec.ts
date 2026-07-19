const mockSetReady = jest.fn()

jest.mock("../../src/health", () => ({ setReady: mockSetReady }))

import { createReadinessMonitor } from "../../src/readinessMonitor"

describe("database readiness monitor", () => {
  beforeEach(() => {
    mockSetReady.mockClear()
  })

  it("marks readiness unavailable and recovers when the database probe recovers", async () => {
    let available = false
    const transitions: string[] = []
    const monitor = createReadinessMonitor({
      probe: async () => {
        if (!available) throw new Error("database unavailable")
      },
      failureThreshold: 1,
      onTransition: (status) => transitions.push(status),
    })

    await monitor.runNow()
    expect(mockSetReady).toHaveBeenLastCalledWith(false)

    available = true
    await monitor.runNow()
    expect(mockSetReady).toHaveBeenLastCalledWith(true)
    expect(transitions).toEqual(["failed", "ready"])
  })

  it("keeps readiness available through isolated failures", async () => {
    const transitions: string[] = []
    const probe = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error("transient database failure"))
      .mockResolvedValue(undefined)
    const monitor = createReadinessMonitor({
      probe,
      failureThreshold: 3,
      onTransition: (status) => transitions.push(status),
    })

    await monitor.runNow()
    expect(mockSetReady).not.toHaveBeenCalledWith(false)

    await monitor.runNow()
    expect(mockSetReady).toHaveBeenLastCalledWith(true)
    expect(transitions).toEqual(["ready"])
  })

  it("fails readiness only after consecutive failures", async () => {
    const transitions: string[] = []
    const monitor = createReadinessMonitor({
      probe: async () => {
        throw new Error("database unavailable")
      },
      failureThreshold: 3,
      onTransition: (status) => transitions.push(status),
    })

    await monitor.runNow()
    await monitor.runNow()
    expect(mockSetReady).not.toHaveBeenCalledWith(false)

    await monitor.runNow()
    expect(mockSetReady).toHaveBeenLastCalledWith(false)
    expect(transitions).toEqual(["failed"])
  })

  it("coalesces overlapping probes and cannot become ready after it stops", async () => {
    let resolveProbe: (() => void) | undefined
    const probe = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveProbe = resolve
        })
    )
    const monitor = createReadinessMonitor({ probe })

    const first = monitor.runNow()
    const second = monitor.runNow()
    expect(second).toBe(first)
    expect(probe).toHaveBeenCalledTimes(1)

    monitor.stop()
    resolveProbe?.()
    await first
    expect(mockSetReady).toHaveBeenLastCalledWith(false)
  })
})
