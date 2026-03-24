import { Router } from "express";
import {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  confirmPickup,
  receiveAtFacility,
  confirmDelivery,
  reassignOrder,
  deleteOrder,
  rescheduleOrder,
} from "../controllers/order.controller";
import { validate } from "../middleware/validate";
import {
  createOrderSchema,
  updateOrderSchema,
  updateStatusSchema,
  pickupConfirmSchema,
  facilityReceiveSchema,
  deliveryConfirmSchema,
  rescheduleOrderSchema,
} from "../validation/order.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  authorize("admin", "staff", "client"),
  validate(createOrderSchema),
  createOrder,
);

router.get("/", getAllOrders);

router.get("/:id", getOrderById);

router.put(
  "/:id",
  authorize("admin", "staff"),
  validate(updateOrderSchema),
  updateOrder,
);

router.patch(
  "/:id/status",
  authorize("admin", "staff"),
  validate(updateStatusSchema),
  updateOrderStatus,
);

router.patch(
  "/:id/pickup",
  authorize("driver", "admin"),
  validate(pickupConfirmSchema),
  confirmPickup,
);

router.patch(
  "/:id/receive",
  authorize("staff", "admin"),
  validate(facilityReceiveSchema),
  receiveAtFacility,
);

router.patch(
  "/:id/deliver",
  authorize("driver", "admin"),
  validate(deliveryConfirmSchema),
  confirmDelivery,
);

router.patch(
  "/:id/reassign",
  authorize("admin", "staff"),
  reassignOrder,
);

router.patch(
  "/:id/reschedule",
  authorize("admin", "staff", "client"),
  validate(rescheduleOrderSchema),
  rescheduleOrder,
);

router.delete("/:id", authorize("admin"), deleteOrder);

export default router;
