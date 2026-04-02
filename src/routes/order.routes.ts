import { Router } from "express";
import {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  advanceOrderStatus,
  deleteOrder,
  rescheduleOrder,
  reassignOrder,
  receiveOrder,
  confirmDelivery,
} from "../controllers/order.controller";
import { validate } from "../middleware/validate";
import {
  createOrderSchema,
  updateOrderSchema,
  advanceStatusSchema,
  rescheduleOrderSchema,
  confirmDriverActionSchema,
} from "../validation/order.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// ─── List & Detail ────────────────────────────────────────────────────────────
router.get("/", getAllOrders);
router.get("/:id", getOrderById);

// ─── Create ───────────────────────────────────────────────────────────────────
router.post(
  "/",
  authorize("admin", "staff", "client"),
  validate(createOrderSchema),
  createOrder,
);

// ─── Update (structural data) ─────────────────────────────────────────────────
router.put(
  "/:id",
  authorize("admin", "staff"),
  validate(updateOrderSchema),
  updateOrder,
);

// ─── Status — single unified PATCH ───────────────────────────────────────────
// Permisos de rol por status se validan dentro del servicio (OrderService.advanceStatus)
router.patch(
  "/:id/status",
  validate(advanceStatusSchema),
  advanceOrderStatus,
);

// ─── Structural operations (no son solo cambio de estado) ────────────────────
router.patch(
  "/:id/reschedule",
  authorize("admin", "staff", "client"),
  validate(rescheduleOrderSchema),
  rescheduleOrder,
);

router.patch(
  "/:id/reassign",
  authorize("admin"),
  reassignOrder,
);

router.patch(
  "/:id/receive",
  authorize("admin", "staff"),
  receiveOrder,
);

router.patch(
  "/:id/deliver",
  authorize("admin", "driver"),
  validate(confirmDriverActionSchema),
  confirmDelivery,
);

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", authorize("admin"), deleteOrder);

export default router;
