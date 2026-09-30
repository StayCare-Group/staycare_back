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
  bulkConfirmDriverAction,
  exportOrdersFlat,
} from "../controllers/order.controller";
import { validate } from "../middleware/validate";
import {
  createOrderSchema,
  updateOrderSchema,
  advanceStatusSchema,
  rescheduleOrderSchema,
  confirmDriverActionSchema,
  bulkConfirmDriverActionSchema,
} from "../validation/order.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize, authorizePermission } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

// ─── Export (must come before /:id to avoid route conflict) ─────────────────
router.post(
  "/export",
  authorize("admin", "staff"),
  exportOrdersFlat,
);

// ─── Bulk driver confirm (must come before /:id to avoid route conflict) ─────
router.patch(
  "/bulk/deliver",
  authorize("admin", "driver", "staff"),
  validate(bulkConfirmDriverActionSchema),
  bulkConfirmDriverAction,
);

// ─── List & Detail ────────────────────────────────────────────────────────────
router.get("/", authorizePermission("orders:read"), getAllOrders);
router.get("/:id", authorizePermission("orders:read"), getOrderById);

// ─── Create ───────────────────────────────────────────────────────────────────
router.post(
  "/",
  authorizePermission("orders:create"),
  validate(createOrderSchema),
  createOrder,
);

// ─── Update (structural data) ─────────────────────────────────────────────────
router.put(
  "/:id",
  authorizePermission("orders:update"),
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
  authorizePermission("orders:update"),
  validate(rescheduleOrderSchema),
  rescheduleOrder,
);

router.patch(
  "/:id/reassign",
  authorize("admin", "staff"),
  reassignOrder,
);

router.patch(
  "/:id/receive",
  authorize("admin", "staff"),
  receiveOrder,
);

router.patch(
  "/:id/deliver",
  authorize("admin", "driver", "staff"),
  validate(confirmDriverActionSchema),
  confirmDelivery,
);

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", authorizePermission("orders:delete"), deleteOrder);

export default router;
