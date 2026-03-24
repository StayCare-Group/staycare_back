import { Router } from "express";
import { validate } from "../middleware/validate";
import { loginUserSchema, registerUserSchema, changePasswordSchema, updateMeSchema } from "../validation/user.validation";
import { authenticate } from "../middleware/authenticate";
import {
  register,
  login,
  refreshAccessToken,
  logout,
  getMe,
  updateMe,
  changePassword,
  requestPasswordReset,
  resetPassword,
} from "../controllers/auth.controller";

const router = Router();

router.post("/register", validate(registerUserSchema), register);
router.post("/login", validate(loginUserSchema), login);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, validate(updateMeSchema), updateMe);
router.patch("/password", authenticate, validate(changePasswordSchema), changePassword);

router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);

export default router;
