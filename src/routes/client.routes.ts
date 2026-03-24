import { Router } from "express";
import {
  createClient,
  createClientForCurrentUser,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  addProperty,
  updateProperty,
  deleteProperty,
  addSelfProperty,
  updateSelfProperty,
  deleteSelfProperty,
} from "../controllers/client.controller";
import { validate } from "../middleware/validate";
import {
  createClientSchema,
  updateClientSchema,
  addPropertySchema,
  updatePropertySchema,
  addSelfPropertySchema,
  updateSelfPropertySchema,
} from "../validation/client.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.post(
  "/self",
  authorize("client", "admin", "staff"),
  validate(createClientSchema),
  createClientForCurrentUser,
);

router.post(
  "/self/properties",
  authorize("client"),
  validate(addSelfPropertySchema),
  addSelfProperty,
);
router.put(
  "/self/properties/:propertyId",
  authorize("client"),
  validate(updateSelfPropertySchema),
  updateSelfProperty,
);
router.delete(
  "/self/properties/:propertyId",
  authorize("client"),
  deleteSelfProperty,
);

router.post(
  "/",
  authorize("admin", "staff"),
  validate(createClientSchema),
  createClient,
);
router.get("/", authorize("admin", "staff"), getAllClients);
router.get("/:id", authorize("admin", "staff", "client"), getClientById);
router.put(
  "/:id",
  authorize("admin", "staff"),
  validate(updateClientSchema),
  updateClient,
);
router.delete("/:id", authorize("admin"), deleteClient);

router.post(
  "/:id/properties",
  authorize("admin", "staff"),
  validate(addPropertySchema),
  addProperty,
);
router.put(
  "/:id/properties/:propertyId",
  authorize("admin", "staff"),
  validate(updatePropertySchema),
  updateProperty,
);
router.delete(
  "/:id/properties/:propertyId",
  authorize("admin", "staff"),
  deleteProperty,
);

export default router;
