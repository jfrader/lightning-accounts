import { readFileSync } from "node:fs"
import path from "node:path"

export interface ApplicationConfig {
  email: string
  remoteAddress?: string
}

export interface ApplicationAuthorization {
  allowed: boolean
  allowedAddresses: string[]
}

export interface ApplicationCredential {
  email: string
  token: string
}

interface ApplicationsConfig {
  applications: ApplicationConfig[]
}

export const loadApplications = (
  filePath = path.join(process.cwd(), "applications.json")
): ApplicationConfig[] => {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<ApplicationsConfig>
    return Array.isArray(parsed.applications) ? parsed.applications : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

export const applications = loadApplications()

export const parseApplicationCredential = (cookie: string): ApplicationCredential => {
  const separatorIndex = cookie.indexOf(":")

  if (separatorIndex <= 0 || separatorIndex === cookie.length - 1) {
    throw new Error("Invalid application credentials")
  }

  return {
    email: cookie.slice(0, separatorIndex),
    token: cookie.slice(separatorIndex + 1),
  }
}

export const resolveApplicationAuthorization = (
  email: string,
  environmentEmails: string[],
  legacyApplications: ApplicationConfig[],
  applicationAddress?: string
): ApplicationAuthorization => {
  const legacyApplication = legacyApplications.find((application) => application.email === email)
  const allowed = environmentEmails.includes(email) || Boolean(legacyApplication)

  if (!allowed) {
    return { allowed: false, allowedAddresses: [] }
  }

  const allowedAddresses = [legacyApplication?.remoteAddress, applicationAddress].filter(
    (address): address is string => Boolean(address)
  )

  return { allowed: true, allowedAddresses: [...new Set(allowedAddresses)] }
}

export const isApplicationSourceAllowed = (
  remoteAddress: string | undefined,
  authorization: ApplicationAuthorization
) =>
  authorization.allowed &&
  (authorization.allowedAddresses.length === 0 ||
    (remoteAddress !== undefined && authorization.allowedAddresses.includes(remoteAddress)))
