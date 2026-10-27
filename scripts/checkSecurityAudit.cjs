const fs = require("node:fs")

const severities = ["info", "low", "moderate", "high", "critical"]

function checkSecurityAudit(format, text) {
  let counts
  const blockers = new Set()
  if (format === "yarn") {
    counts = Object.fromEntries(severities.map((severity) => [severity, 0]))
    let summary
    for (const line of text.trim().split("\n")) {
      const { type, data } = JSON.parse(line)
      if (type === "error") throw new Error(String(data))
      if (type === "auditSummary") summary = data.vulnerabilities
      if (type !== "auditAdvisory") continue
      const advisory = data.advisory
      if (!severities.includes(advisory.severity)) throw new Error("Unknown advisory severity")
      counts[advisory.severity]++
      if (["high", "critical"].includes(advisory.severity)) {
        blockers.add(
          `${advisory.severity}: ${advisory.module_name} — ${advisory.title} (${advisory.url})`
        )
      }
    }
    if (!summary || severities.some((key) => summary[key] !== counts[key])) {
      throw new Error("Missing or inconsistent audit summary")
    }
  } else if (format === "npm") {
    const report = JSON.parse(text)
    if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities) {
      throw new Error("Incomplete npm audit report")
    }
    counts = Object.fromEntries(severities.map((severity) => [severity, 0]))
    for (const [name, advisory] of Object.entries(report.vulnerabilities)) {
      if (!severities.includes(advisory.severity)) throw new Error("Unknown advisory severity")
      counts[advisory.severity]++
      if (["high", "critical"].includes(advisory.severity)) {
        blockers.add(`${advisory.severity}: ${name} (${advisory.range})`)
      }
    }
    const summary = report.metadata?.vulnerabilities
    if (
      !summary ||
      severities.some((key) => summary[key] !== counts[key]) ||
      summary.total !== Object.values(counts).reduce((sum, count) => sum + count, 0)
    ) {
      throw new Error("Missing or inconsistent audit summary")
    }
  } else {
    throw new Error("Unknown audit format")
  }
  return { counts, blockers: [...blockers] }
}

module.exports = checkSecurityAudit

if (require.main === module) {
  try {
    const { counts, blockers } = checkSecurityAudit(
      process.argv[2],
      fs.readFileSync(process.argv[3], "utf8")
    )
    console.log(
      `Production audit (${process.argv[2]}): ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low, ${counts.info} info.`
    )
    for (const blocker of blockers) console.error(`BLOCKED ${blocker}`)
    if (blockers.length) {
      console.error("FAIL: critical or high production findings block release.")
      process.exitCode = 1
    } else {
      console.log(
        "PASS: no critical or high production findings; moderate and low do not block release."
      )
    }
  } catch (error) {
    console.error(`FAIL: production audit could not be verified: ${error.message}`)
    process.exitCode = 1
  }
}
