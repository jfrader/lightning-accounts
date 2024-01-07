import express from "express"
import auth from "../../middlewares/auth"
import validate from "../../middlewares/validate"
import { UserPermission } from "../../config/roles"
import walletValidation from "../../validations/wallet.validation"
import walletController from "../../controllers/wallet.controller"

const router = express.Router()

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Wallet management
 */
router
  .route("/deposit")
  /**
   * @swagger
   * /wallet/deposit:
   *   post:
   *     summary: Create a deposit invoice
   *     description: Create a lightning invoice to deposit sats to user's wallet.
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amountInSats
   *             properties:
   *               amountInSats:
   *                 type: number
   *             example:
   *               amountInSats: 100
   *     responses:
   *       "201":
   *         description: Created
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/Transaction'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .post(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.createDeposit),
    walletController.createDeposit
  )

/**
 * @swagger
 * /wallet/deposit/{transactionId}:
 *   get:
 *     summary: Get deposit transaction
 *     description: Get deposit transaction status
 *     tags: [Wallets]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Transaction'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *
 */

router
  .route("/deposit/:transactionId")
  .get(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.getDeposit),
    walletController.getDeposit
  )

export default router
