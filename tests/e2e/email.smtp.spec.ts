import { simpleParser, type ParsedMail } from "mailparser"
import { SMTPServer } from "smtp-server"

const sender = "mailer@example.test"
const recipient = "player@example.test"
const rejectedRecipient = "rejected@example.test"
const username = "smtp-test"
const password = "smtp-test-password"
const origin = "http://localhost:3000"
const messages: { from: string; to: string[]; mail: ParsedMail }[] = []
const authentication = jest.fn()
let emailService: typeof import("../../src/services/email.service").default
const originalEnvironment = process.env

const server = new SMTPServer({
  disabledCommands: ["STARTTLS"],
  disableReverseLookup: true,
  onAuth(auth, _session, callback) {
    authentication(auth.username, auth.password)
    if (auth.username !== username || auth.password !== password) {
      callback(new Error("Invalid test credentials"))
      return
    }
    callback(null, { user: username })
  },
  onRcptTo(address, _session, callback) {
    if (address.address === rejectedRecipient) {
      callback(Object.assign(new Error("Recipient rejected"), { responseCode: 550 }))
      return
    }
    callback()
  },
  onData(stream, session, callback) {
    simpleParser(stream).then(
      (mail) => {
        messages.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
          to: session.envelope.rcptTo.map(({ address }) => address),
          mail,
        })
        callback()
      },
      (error: Error) => callback(error)
    )
  },
})

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.server.address()
  if (!address || typeof address === "string") throw new Error("SMTP server has no TCP port")
  process.env = {
    ...process.env,
    NODE_ENV: "test",
    NODE_ORIGIN: origin,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(address.port),
    SMTP_USERNAME: username,
    SMTP_PASSWORD: password,
    EMAIL_FROM: sender,
  }
  emailService = (await import("../../src/services/email.service")).default
})

beforeEach(() => {
  messages.length = 0
  authentication.mockClear()
})

afterAll(async () => {
  emailService?.transport.close()
  process.env = originalEnvironment
  await new Promise<void>((resolve) => server.close(resolve))
})

describe("application mailer over local SMTP", () => {
  it("delivers a Unicode recipient name and subject with a multiline text body", async () => {
    const subject = "Verificación de José — ingreso"
    const text = "Hola José,\n\nPrimera línea.\n.Segunda línea con punto inicial.\nÚltima línea.\n"
    const info = await emailService.sendEmail(`José <${recipient}>`, subject, text)

    expect(authentication).toHaveBeenCalledWith(username, password)
    expect(info.accepted).toEqual([recipient])
    expect(messages).toHaveLength(1)
    const message = messages[0]
    expect(message.from).toBe(sender)
    expect(message.to).toEqual([recipient])
    expect(message.mail.from?.value).toEqual([{ address: sender, name: "" }])
    expect(message.mail.to).toMatchObject({ value: [{ address: recipient, name: "José" }] })
    expect(message.mail.subject).toBe(subject)
    expect(message.mail.text).toBe(text)
    expect(message.mail.messageId).toBe(info.messageId)
    expect(message.mail.headers.get("mime-version")).toBe("1.0")
    expect(message.mail.headers.get("content-type")).toMatchObject({
      value: "text/plain",
      params: { charset: "utf-8" },
    })
  })

  it("delivers the application's magic-link template and encoded URL", async () => {
    const token = "token+with/slash=1"
    const next = "/profile?tab=cuenta&language=es"
    await emailService.sendMagicLinkEmail(recipient, token, next)

    expect(messages).toHaveLength(1)
    const message = messages[0]
    expect(message.from).toBe(sender)
    expect(message.to).toEqual([recipient])
    expect(message.mail.subject).toBe("Tu link de ingreso a Trucoshi")
    const url = `${origin}/magic-link?${new URLSearchParams({ token, next })}`
    expect(message.mail.text).toBe(
      `Querido usuario,\n\nPara ingresar a Trucoshi, hace click en este link: ${url}\nSi no pediste ingresar, ignora este email.\n`
    )
  })

  it("rejects a failed send instead of reporting success", async () => {
    await expect(
      emailService.sendEmail(rejectedRecipient, "Rejected", "Not delivered")
    ).rejects.toMatchObject({
      code: "EENVELOPE",
      responseCode: 550,
      command: "RCPT TO",
    })
    expect(messages).toHaveLength(0)
  })
})
