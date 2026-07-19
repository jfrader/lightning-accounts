import { setReady } from "./health"

type ReadinessMonitorOptions = {
  probe: () => Promise<unknown>
  intervalMs?: number
  timeoutMs?: number
  failureThreshold?: number
  onTransition?: (status: "ready" | "failed", error?: unknown) => void
}

const probeWithTimeout = async (probe: () => Promise<unknown>, timeoutMs: number) => {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness probe timed out")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export const createReadinessMonitor = ({
  probe,
  intervalMs = 10_000,
  timeoutMs = 5_000,
  failureThreshold = 3,
  onTransition,
}: ReadinessMonitorOptions) => {
  let timer: NodeJS.Timeout | undefined
  let currentRun: Promise<void> | undefined
  let stopped = false
  let lastStatus: "ready" | "failed" | undefined
  let consecutiveFailures = 0

  const run = async () => {
    try {
      await probeWithTimeout(probe, timeoutMs)
      if (!stopped) {
        consecutiveFailures = 0
        setReady(true)
        if (lastStatus !== "ready") {
          lastStatus = "ready"
          onTransition?.("ready")
        }
      }
    } catch (error) {
      if (!stopped) {
        consecutiveFailures += 1
        if (consecutiveFailures >= failureThreshold) {
          setReady(false)
          if (lastStatus !== "failed") {
            lastStatus = "failed"
            onTransition?.("failed", error)
          }
        }
      }
    }
  }

  return {
    runNow() {
      if (!currentRun) {
        currentRun = run().finally(() => {
          currentRun = undefined
        })
      }
      return currentRun
    },
    start() {
      stopped = false
      if (!timer) {
        timer = setInterval(() => void this.runNow(), intervalMs)
        timer.unref()
      }
    },
    stop() {
      stopped = true
      setReady(false)
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
    },
  }
}
