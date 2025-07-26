declare module "jsonwebtoken" {
  export interface JwtPayload {
    name: string
  }
}

export const enum JwtCookie {
  access = "access",
  refresh = "refresh",
  identity = "identity",
}

export const enum SessionCookie {
  sid = "sid",
}
