import express from "express"
import auth from "../../middlewares/auth"
import validate from "../../middlewares/validate"
import { userValidation } from "../../validations"
import { userController } from "../../controllers"
import { UserPermission } from "../../config/roles"

const router = express.Router()

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and retrieval
 */

router
  .route("/")
  /**
   * @swagger
   * /users:
   *   post:
   *     summary: Create a user
   *     description: Only admins can create other users.
   *     tags: [Users]
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
   *               - role
   *             properties:
   *               name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *                 description: must be unique
   *               password:
   *                 type: string
   *                 format: password
   *                 minLength: 8
   *                 description: At least one number and one letter
   *               role:
   *                  type: string
   *                  enum: [user, admin]
   *             example:
   *               name: fake name
   *               email: fake@example.com
   *               password: password1
   *               role: user
   *     responses:
   *       "201":
   *         description: Created
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/User'
   *       "400":
   *         $ref: '#/components/responses/DuplicateEmail'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   *   get:
   *     summary: Get all users
   *     description: Only admins can retrieve all users.
   *     tags: [Users]
   *     parameters:
   *       - in: query
   *         name: name
   *         schema:
   *           type: string
   *         description: User name
   *       - in: query
   *         name: role
   *         schema:
   *           type: string
   *         description: User role
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *         description: sort by query in the form of field:desc/asc (ex. name:asc)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *         default: 10
   *         description: Maximum number of users
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *         description: Page number
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 results:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/User'
   *                 page:
   *                   type: integer
   *                   example: 1
   *                 limit:
   *                   type: integer
   *                   example: 10
   *                 totalPages:
   *                   type: integer
   *                   example: 1
   *                 totalResults:
   *                   type: integer
   *                   example: 1
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   */

  .post(
    auth(UserPermission.users_write),
    validate(userValidation.createUser),
    userController.createUser
  )
  .get(auth(UserPermission.users_read), validate(userValidation.getUsers), userController.getUsers)

router
  .route("/:userId")
  /**
   * @swagger
   * /users/{id}:
   *   get:
   *     summary: Get a user
   *     description: Logged in users can fetch only their own user information. Only admins can fetch other users.
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User id
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/User'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *       "404":
   *         $ref: '#/components/responses/NotFound'
   *
   *   patch:
   *     summary: Update a user
   *     description: Logged in users can only update their own information. Only admins can update other users.
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User id
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *                 description: must be unique
   *               currentPassword:
   *                 type: string
   *                 format: password
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
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/User'
   *       "400":
   *         $ref: '#/components/responses/DuplicateEmail'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *       "404":
   *         $ref: '#/components/responses/NotFound'
   *
   *   delete:
   *     summary: Delete a user
   *     description: Logged in users can delete only themselves. Only admins can delete other users.
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User id
   *     responses:
   *       "200":
   *         description: No content
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *       "404":
   *         $ref: '#/components/responses/NotFound'
   */

  .get(auth(UserPermission.users_read), validate(userValidation.getUser), userController.getUser)
  .patch(
    auth(UserPermission.users_write),
    validate(userValidation.updateUser),
    userController.updateUser
  )
  .delete(
    auth(UserPermission.users_write),
    validate(userValidation.deleteUser),
    userController.deleteUser
  )

router
  .route("/:userId/wallet")
  /**
   * @swagger
   * /users/{id}/wallet:
   *   get:
   *     summary: Get a user wallet
   *     description: Get user wallet (only yourself if not admin)
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: User id
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/Wallet'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *       "404":
   *         $ref: '#/components/responses/NotFound'
   *
   */

  .get(
    auth(UserPermission.users_read),
    validate(userValidation.getUser),
    userController.getUserWallet
  )

export default router
