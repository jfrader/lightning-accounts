declare module "jsonwebtoken" {
  export interface JwtPayload {
    name: string
  }
}

export const enum JwtCookie {
  access = "jwt:access",
  refresh = "jwt:refresh",
  identity = "jwt:identity",
}

export const enum SessionCookie {
  sid = "lightning-accounts:sid",
}
