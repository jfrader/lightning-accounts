import { NextFunction, Request, Response } from "express"

export function noIndexHeader(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow")
  next()
}

export function robotsTxt(_req: Request, res: Response) {
  res.type("text/plain").send("User-agent: *\nDisallow: /\n")
}
