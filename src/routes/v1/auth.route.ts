import express from "express"
import validate from "../../middlewares/validate"
import authValidation from "../../validations/auth.validation"
import { authController } from "../../controllers"
import auth from "../../middlewares/auth"
import passport from "passport"

const router = express.Router()

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get user's own profile
 *     operationId: getUserProfile
 *     tags: [Auth]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/me", auth(), authController.getMe)

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     operationId: registerUser
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Must be unique
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: At least one number and one letter
 *             example:
 *               name: fake name
 *               email: fake@example.com
 *               password: password1
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 */
router.post("/register", validate(authValidation.register), authController.register)

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in a user
 *     operationId: loginUser
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *             example:
 *               email: fake@example.com
 *               password: password1
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       "401":
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               code: 401
 *               message: Invalid email or password
 */
router.post("/login", validate(authValidation.login), authController.login)

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Log out a user
 *     operationId: logoutUser
 *     tags: [Auth]
 *     responses:
 *       "204":
 *         description: No content
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.post("/logout", authController.logout)

/**
 * @swagger
 * /auth/refresh-tokens:
 *   post:
 *     summary: Refresh authentication tokens
 *     operationId: refreshAuthTokens
 *     tags: [Auth]
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/refresh-tokens", authController.refreshTokens)

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset
 *     description: An email will be sent to reset the password.
 *     operationId: requestPasswordReset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *             example:
 *               email: fake@example.com
 *     responses:
 *       "204":
 *         description: No content
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/forgot-password",
  validate(authValidation.forgotPassword),
  authController.forgotPassword
)

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset user password
 *     operationId: resetPassword
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The reset password token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: At least one number and one letter
 *             example:
 *               password: password1
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         description: Password reset failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               code: 401
 *               message: Password reset failed
 */
router.post("/reset-password", validate(authValidation.resetPassword), authController.resetPassword)

/**
 * @swagger
 * /auth/send-verification-email:
 *   post:
 *     summary: Send email verification
 *     description: An email will be sent to verify the user's email.
 *     operationId: sendVerificationEmail
 *     tags: [Auth]
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/send-verification-email", auth(), authController.sendVerificationEmail)

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify user email
 *     operationId: verifyEmail
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The verify email token
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         description: Email verification failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               code: 401
 *               message: Verify email failed
 */
router.post("/verify-email", validate(authValidation.verifyEmail), authController.verifyEmail)

/**
 * @swagger
 * /auth/twitter:
 *   get:
 *     summary: Initiate Twitter authentication
 *     operationId: initiateTwitterAuth
 *     tags: [Auth]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/twitter",
  passport.authenticate("twitter", {
    scope: ["tweet.read", "users.read", "offline.access"],
  })
)

/**
 * @swagger
 * /auth/twitter/callback:
 *   get:
 *     summary: Handle Twitter authentication callback
 *     operationId: handleTwitterAuthCallback
 *     tags: [Auth]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/twitter/callback",
  (req, res, next) => {
    auth()(req, res, () => {
      next()
    })
  },
  (req, res, next) => {
    passport.authenticate("twitter")(req, res, next)
  },
  authController.loginTwitter
)

export default router
