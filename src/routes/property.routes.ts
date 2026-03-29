import { Router } from "express";
import {
  addProperty,
  updateProperty,
  deleteProperty,
  getUserProperties,
} from "../controllers/property.controller";
import { validate } from "../middleware/validate";
import {
  createPropertySchema,
  updatePropertySchema,
} from "../validation/property.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// Add property (Self: client role, or Admin for others)
router.post("/", validate(createPropertySchema), addProperty);
router.post("/user/:userId", authorize("admin"), validate(createPropertySchema), addProperty);

// Get properties of a specific user (Admin only)
router.get("/user/:userId", authorize("admin", "client"), getUserProperties);

// Update/Delete property (Self if owner, or Admin)
router.put("/:id", validate(updatePropertySchema), updateProperty);
router.delete("/:id", deleteProperty);

export default router;
