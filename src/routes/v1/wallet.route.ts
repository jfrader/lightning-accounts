import express from "express"
import auth from "../../middlewares/auth"
import validate from "../../middlewares/validate"
import { UserPermission } from "../../config/roles"
import walletValidation from "../../validations/wallet.validation"
import walletController from "../../controllers/wallet.controller"
import { lndConnected } from "../../middlewares/lnd"

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
   *                 type: integer
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
    lndConnected,
    validate(walletValidation.createDeposit),
    walletController.createDeposit
  )

router
  .route("/withdraw")
  /**
   * @swagger
   * /wallet/withdraw:
   *   post:
   *     summary: Pay a lightning invoice
   *     description: Pay a lightning invoice with the user balance, and use the whole balance if it is a zero-value invoice
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - invoice
   *             properties:
   *               invoice:
   *                 type: string
   *             example:
   *               invoice: lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs
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
    auth(UserPermission.wallet_pay),
    lndConnected,
    validate(walletValidation.withdraw),
    walletController.payWithdrawInvoice
  )

router
  .route("/pay")
  /**
   * @swagger
   * /wallet/pay:
   *   post:
   *     summary: Pay user
   *     operationId: payUser
   *     description: Pay sats to user from your balance
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amountInSats
   *               - userId
   *             properties:
   *               amountInSats:
   *                 type: integer
   *               userId:
   *                 type: integer
   *               description:
   *                 type: string
   *             example:
   *               amountInSats: 100
   *               userId: 5
   *               description: Transaction Description
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
    auth(UserPermission.wallet_pay_user),
    validate(walletValidation.payUser),
    walletController.payUser
  )

router
  .route("/deposit/:transactionId")
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
  .get(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.getDeposit),
    walletController.getDeposit
  )

router
  .route("/pay-request/:payRequestId")
  /**
   * @swagger
   * /wallet/pay-request/{payRequestId}:
   *   get:
   *     summary: Get pay request
   *     description: Get pay request
   *     tags: [Wallets]
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/PayRequest'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .get(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.getPayRequest),
    walletController.getPayRequest
  )

router
  .route("/pay-request/:payRequestId/pay")
  /**
   * @swagger
   * /wallet/pay-request/{payRequestId}/pay:
   *   post:
   *     summary: Pay a pay request
   *     operationId: payRequest
   *     description: Pay a PayRequest sent to the user
   *     tags: [Wallets]
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/PayRequest'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .post(
    auth(UserPermission.wallet_pay_user),
    validate(walletValidation.payRequest),
    walletController.payRequest
  )

router
  .route("/pay-request")
  /**
   * @swagger
   * /wallet/pay-request:
   *   post:
   *     summary: Create a payment request
   *     description: Create a pay request another user can pay from their balance
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amountInSats
   *               - receiverId
   *             properties:
   *               receiverId:
   *                 type: integer
   *               amountInSats:
   *                 type: integer
   *               meta:
   *                 type: object
   *               description:
   *                 type: string
   *             example:
   *               amountInSats: 100
   *               receiverId: 5
   *               description: "super pay request"
   *               meta: { any: { valid: { notCircular: object } }}
   *     responses:
   *       "201":
   *         description: Created
   *         content:
   *           application/json:
   *             schema:
   *                $ref: '#/components/schemas/PayRequest'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .post(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.createPayRequest),
    walletController.createPayRequest
  )

router
  .route("/pay-requests")
  /**
   * @swagger
   * /wallet/pay-requests:
   *   post:
   *     summary: Create multiple payment requests
   *     description: Create multiple pay requests that another user can pay from their balance
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amountInSats
   *               - receiverIds
   *             properties:
   *               receiverIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               amountInSats:
   *                 type: integer
   *               meta:
   *                 type: object
   *               description:
   *                 type: string
   *             example:
   *               amountInSats: 100
   *               receiverId: 5
   *               description: "super pay request"
   *               meta: { any: { valid: { notCircular: object } }}
   *     responses:
   *       "201":
   *         description: Created
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/PayRequest'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .post(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.createPayRequests),
    walletController.createPayRequests
  )
  /**
   * @swagger
   * /wallet/pay-requests:
   *   get:
   *     summary: Get multiple pay requests
   *     description: Get multiple pay requests
   *     tags: [Wallets]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - payRequestIds
   *             properties:
   *               payRequestIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/PayRequest'
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *
   */
  .get(
    auth(UserPermission.wallet_invoice),
    validate(walletValidation.getPayRequests),
    walletController.getPayRequests
  )

router
  .route("/latest-bitcoin-block")
  /**
   * @swagger
   * /wallet/latest-bitcoin-block:
   *   get:
   *     operationId: getLatestBitcoinBlock
   *     summary: Get the latest Bitcoin block information
   *     description: Retrieve the hash and height of the latest Bitcoin block from the LND node using the `getLatestBitcoinBlock` method.
   *     tags: [Wallets]
   *     responses:
   *       "200":
   *         description: OK
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 hash:
   *                   type: string
   *                   required: true
   *                   description: The hash of the latest Bitcoin block
   *                 height:
   *                   type: number
   *                   required: true
   *                   description: The height of the latest Bitcoin block
   *               example:
   *                 hash: "000000000000000000076a914d8f6b4b6c5f7a3b2c9e4d5f6a7b8c9d0e1f2a3b4"
   *                 height: 850123
   *       "401":
   *         $ref: '#/components/responses/Unauthorized'
   *       "403":
   *         $ref: '#/components/responses/Forbidden'
   *       "503":
   *         $ref: '#/components/responses/ServiceUnavailable'
   *
   */
  .get(auth(UserPermission.wallet_invoice), lndConnected, walletController.getLatestBlockHash)

export default router
