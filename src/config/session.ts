import { SessionData, Store } from "express-session"
import { PrismaClient } from "@prisma/client"

export class PrismaSessionStore extends Store {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    super()
    this.prisma = prisma
  }

  async get(sid: string, callback: (err: any, session?: SessionData | null) => void) {
    try {
      const session = await this.prisma.session.findUnique({
        where: { sid },
      })
      if (!session || session.expire < new Date()) {
        callback(null, null)
        return
      }
      callback(null, session.sess as unknown as SessionData)
    } catch (err) {
      callback(err)
    }
  }

  async set(sid: string, session: SessionData, callback?: (err?: any) => void) {
    try {
      const expire = new Date(session.cookie.expires || Date.now() + 24 * 60 * 60 * 1000)
      await this.prisma.session.upsert({
        where: { sid },
        update: { sess: session as any, expire, updatedAt: new Date() },
        create: { sid, sess: session as any, expire },
      })
      callback?.(null)
    } catch (err) {
      callback?.(err)
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void) {
    try {
      await this.prisma.session.delete({ where: { sid } })
      callback?.(null)
    } catch (err) {
      callback?.(err)
    }
  }

  async touch(sid: string, session: SessionData, callback?: (err?: any) => void) {
    try {
      const expire = new Date(session.cookie.expires || Date.now() + 24 * 60 * 60 * 1000)
      await this.prisma.session.update({
        where: { sid },
        data: { expire, updatedAt: new Date() },
      })
      callback?.(null)
    } catch (err) {
      callback?.(err)
    }
  }

  async clear(callback?: (err?: any) => void) {
    try {
      await this.prisma.session.deleteMany({})
      callback?.(null)
    } catch (err) {
      callback?.(err)
    }
  }

  async length(callback: (err: any, length: number) => void) {
    try {
      const count = await this.prisma.session.count()
      callback(null, count)
    } catch (err) {
      callback(err, 0)
    }
  }
}
