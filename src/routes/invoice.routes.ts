import { Router } from "express";
import {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  recordPayment,
  markOverdue,
} from "../controllers/invoice.controller";
import { validate } from "../middleware/validate";
import {
  createInvoiceSchema,
  recordPaymentSchema,
} from "../validation/invoice.validation";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  authorize("admin", "staff"),
  validate(createInvoiceSchema),
  createInvoice,
);

router.get("/", authorize("admin", "staff", "client"), getAllInvoices);

router.get("/:id", authorize("admin", "staff", "client"), getInvoiceById);

router.post(
  "/:id/payments",
  authorize("admin", "staff"),
  validate(recordPaymentSchema),
  recordPayment,
);

router.post("/mark-overdue", authorize("admin"), markOverdue);

export default router;
