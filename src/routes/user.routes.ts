import { Router } from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
} from "../controllers/user.controller";
import { validate } from "../middleware/validate";
import { createUserSchema } from "../validation/user.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("admin"),
  validate(createUserSchema),
  createUser,
);
router.get("/", authenticate, authorize("admin", "staff"), getAllUsers);
router.get("/:id", authenticate, authorize("admin", "staff"), getUserById);
router.put("/:id", authenticate, authorize("admin"), updateUser);
router.delete("/:id", authenticate, authorize("admin"), deactivateUser);

export default router;
