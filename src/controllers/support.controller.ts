import { Role, User } from "@prisma/client"
import httpStatus from "http-status"
import { emailService } from "../services"
import ApiError from "../utils/ApiError"
import catchAsync from "../utils/catchAsync"

type FeedbackBody = {
  message: string
  context: "lobby" | "match"
  matchSessionId?: string | null
  author: {
    name: string
    session: string
    accountId?: number | null
    accountEmail?: string | null
  }
}

const contextLabels: Record<FeedbackBody["context"], string> = {
  lobby: "el lobby",
  match: "una partida",
}

const submitFeedback = catchAsync(async (req, res) => {
  const application = req.user as User

  if (application?.role !== Role.APPLICATION) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only applications can send feedback")
  }

  if (!application.email) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Feedback recipient is not configured")
  }

  const feedback = req.body as FeedbackBody
  const contextLabel = contextLabels[feedback.context]
  const details = [
    `Pantalla: ${contextLabel}`,
    feedback.matchSessionId ? `Sala: ${feedback.matchSessionId}` : null,
    `Jugador: ${feedback.author.name}`,
    `Sesion: ${feedback.author.session}`,
    feedback.author.accountId ? `Cuenta: ${feedback.author.accountId}` : "Cuenta: invitado",
    feedback.author.accountEmail ? `Email de cuenta: ${feedback.author.accountEmail}` : null,
    `Recibido: ${new Date().toISOString()}`,
  ].filter(Boolean)

  await emailService.sendEmail(
    application.email,
    `[Trucoshi] Nuevo comentario desde ${contextLabel}`,
    [`Nuevo comentario de Trucoshi:`, "", feedback.message, "", ...details].join("\n")
  )

  res.status(httpStatus.NO_CONTENT).send()
})

export default { submitFeedback }
