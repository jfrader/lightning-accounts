import nodemailer from "nodemailer"
import config from "../config/config"
import logger from "../config/logger"

const transport: nodemailer.Transporter = nodemailer.createTransport({
  ...config.email.smtp,
  secure: false,
})

// Verify SMTP connection
transport
  .verify()
  .then(() => logger.info("Connected to email server"))
  .catch((error) =>
    logger.warn(
      `Unable to connect to email server: ${error.message}. Make sure you have configured the SMTP options in .env`
    )
  )

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to: string, subject: string, text: string) => {
  try {
    const msg = { from: config.email.from, to, subject, text }
    const info = await transport.sendMail(msg)
    logger.info(`Email sent to ${to}: ${info.messageId}`)
    return info
  } catch (error: any) {
    logger.error(`Failed to send email to ${to}: ${error.message}`)
    throw error
  }
}

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to: string, token: string) => {
  const subject = "Reset Password"
  const resetPasswordUrl = `${config.origin}/reset-password?token=${token}`
  const text = `Querido usuario,\n\nPara resetear tu password, hace click en este link: ${resetPasswordUrl}\nSi no pediste resetear tu password, ignora este email.`
  await sendEmail(to, subject, text)
}

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to: string, token: string) => {
  const subject = "Email Verification"
  const verificationEmailUrl = `${config.origin}/verify-email?token=${token}`
  const text = `Querido usuario,\n\nPara verificar tu email, hace click en este link: ${verificationEmailUrl}\nSi no te registraste en Trucoshi, ignora este email.`
  await sendEmail(to, subject, text)
}

export default {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
}
