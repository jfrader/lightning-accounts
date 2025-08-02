import config from "../src/config/config.js"
import logger from "../src/config/logger.js"
import emailService from "../src/services/email.service.js"

async function testEmail(to: string) {
  try {
    // Generate a dummy token for testing
    const testToken = "test-token-123"
    await emailService.sendVerificationEmail(to, testToken)
    logger.info(`Test email sent successfully to ${to}`)
  } catch (error: any) {
    logger.error(`Failed to send test email to ${to}: ${error.message}`)
    process.exit(1) // Exit with error code
  }
}

// Get "to" email from command-line argument
const toEmail = process.argv[2] || config.email.from

if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
  logger.error("Please provide a valid email address as a command-line argument")
  console.error("Usage: node testEmail.js <to-email>")
  process.exit(1)
}

// Run the test
testEmail(toEmail)
