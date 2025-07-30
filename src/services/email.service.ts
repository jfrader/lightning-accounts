import nodemailer from "nodemailer"
import config from "../config/config"
import logger from "../config/logger"

const transport: nodemailer.Transporter = nodemailer.createTransport(config.email.smtp)
transport
  .verify()
  .then(() => logger.info("Connected to email server"))
  .catch(() =>
    logger.warn(
      "Unable to connect to email server. Make sure you have configured the SMTP options in .env"
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
  const msg = { from: config.email.from, to, subject, text }
  await transport.sendMail(msg)
}

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to: string, token: string) => {
  const subject = "Reset password"
  const resetPasswordUrl = `http://link-to-app/reset-password?token=${token}`
  const text = `Dear user,
To reset your password, click on this link: ${resetPasswordUrl}
If you did not request any password resets, then ignore this email.`
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
  const verificationEmailUrl = `http://link-to-app/verify-email?token=${token}`
  const text = `Dear user,
To verify your email, click on this link: ${verificationEmailUrl}`
  await sendEmail(to, subject, text)
}

export default {
  transport,
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
}
