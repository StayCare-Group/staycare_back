import { Router } from "express";
import { healthCheck } from "../controllers/health.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.get("/", healthCheck);
router.get("/admin", authenticate, authorize("admin"), healthCheck);

export default router;