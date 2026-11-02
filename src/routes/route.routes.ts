import { Router } from "express";
import {
  createRoute,
  getAllRoutes,
  getRouteById,
  updateRoute,
  updateRouteStatus,
  deleteRoute,
} from "../controllers/route.controller";
import { validate } from "../middleware/validate";
import {
  createRouteSchema,
  updateRouteSchema,
  updateRouteStatusSchema,
} from "../validation/route.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  authorize("admin"),
  validate(createRouteSchema),
  createRoute,
);

router.get("/", authorize("admin", "driver"), getAllRoutes);

router.get("/:id", authorize("admin", "driver"), getRouteById);

router.put(
  "/:id",
  authorize("admin"),
  validate(updateRouteSchema),
  updateRoute,
);

router.patch(
  "/:id/status",
  authorize("admin", "driver"),
  validate(updateRouteStatusSchema),
  updateRouteStatus,
);

router.delete("/:id", authorize("admin"), deleteRoute);

export default router;
