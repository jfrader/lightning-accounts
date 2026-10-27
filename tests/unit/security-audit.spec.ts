import { execFileSync } from "node:child_process"

const audit = (format: string, report: unknown) => {
  const script = `const check = require('./scripts/checkSecurityAudit.cjs');
    const result = check(process.argv[1], require('node:fs').readFileSync(0, 'utf8'));
    if (result.blockers.length) process.exit(1);`
  return () =>
    execFileSync(process.execPath, ["-e", script, format], {
      input: typeof report === "string" ? report : JSON.stringify(report),
      stdio: ["pipe", "pipe", "pipe"],
    })
}

const counts = { info: 0, low: 0, moderate: 1, high: 0, critical: 0 }
const npmReport = {
  auditReportVersion: 2,
  vulnerabilities: { mailer: { severity: "moderate", range: "<2" } },
  metadata: { vulnerabilities: { ...counts, total: 1 } },
}

it("allows moderate npm consumer findings", () => {
  expect(audit("npm", npmReport)).not.toThrow()
})

it.each(["high", "critical"])("blocks %s npm consumer findings", (severity) => {
  expect(
    audit("npm", {
      ...npmReport,
      vulnerabilities: { vulnerable: { severity, range: "<2" } },
      metadata: { vulnerabilities: { ...counts, moderate: 0, [severity]: 1, total: 1 } },
    })
  ).toThrow()
})

it.each([
  {},
  { ...npmReport, error: { code: "EAUDIT" } },
  {
    ...npmReport,
    metadata: { vulnerabilities: { ...counts, moderate: 0, total: 0 } },
  },
  { ...npmReport, vulnerabilities: { unknown: { severity: "unknown" } } },
])("fails closed on incomplete or inconsistent npm audits: %j", (report) => {
  expect(audit("npm", report)).toThrow()
})

it("checks Yarn advisories against the summary", () => {
  const advisory = {
    type: "auditAdvisory",
    data: { advisory: { severity: "moderate", module_name: "mailer" } },
  }
  const summary = { type: "auditSummary", data: { vulnerabilities: counts } }
  expect(
    audit("yarn", [advisory, summary].map((line) => JSON.stringify(line)).join("\n"))
  ).not.toThrow()
  expect(audit("yarn", JSON.stringify(summary))).toThrow()
  expect(audit("yarn", JSON.stringify({ type: "error", data: "network unavailable" }))).toThrow()
})
