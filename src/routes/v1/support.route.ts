import express from "express"
import { supportController } from "../../controllers"
import { UserPermission } from "../../config/roles"
import auth from "../../middlewares/auth"
import validate from "../../middlewares/validate"
import { supportValidation } from "../../validations"

const router = express.Router()

router.post(
  "/feedback",
  auth(UserPermission.feedback_send),
  validate(supportValidation.feedback),
  supportController.submitFeedback
)

export default router
