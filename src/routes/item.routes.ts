import { Router } from "express";
import {
  createItem,
  getAllItems,
  getItemById,
  updateItem,
  deleteItem,
  seedItems,
} from "../controllers/item.controller";
import { validate } from "../middleware/validate";
import { createItemSchema, updateItemSchema } from "../validation/item.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.get("/", getAllItems);
router.get("/:id", getItemById);

router.post(
  "/",
  authenticate,
  authorize("admin"),
  validate(createItemSchema),
  createItem,
);

router.patch(
  "/:id",
  authenticate,
  authorize("admin"),
  validate(updateItemSchema),
  updateItem,
);

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  validate(updateItemSchema),
  updateItem,
);

router.delete("/:id", authenticate, authorize("admin"), deleteItem);

router.post("/seed", authenticate, authorize("admin"), seedItems);

export default router;
