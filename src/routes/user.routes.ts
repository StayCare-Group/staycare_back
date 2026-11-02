import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
} from "../controllers/user.controller";
import { validate } from "../middleware/validate";
import { updateUserByAdminSchema } from "../validation/user.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// Admin/Staff/Operator: list users (operator is restricted to active operators in controller)
router.get("/", authorize("admin", "staff", "operator"), getAllUsers);
router.get("/:id", authorize("admin", "staff"), getUserById);

// Admin only: update/deactivate users
router.put("/:id", authorize("admin"), validate(updateUserByAdminSchema), updateUser);
router.patch("/:id/deactivate", authorize("admin"), deactivateUser);

export default router;
