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

// Admin/Staff only: list and get user details
router.get("/", authorize("admin", "staff"), getAllUsers);
router.get("/:id", authorize("admin", "staff"), getUserById);

// Admin only: update/deactivate users
router.put("/:id", authorize("admin"), validate(updateUserByAdminSchema), updateUser);
router.patch("/:id/deactivate", authorize("admin"), deactivateUser);

export default router;
