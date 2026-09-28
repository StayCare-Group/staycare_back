import { Router } from "express";
import {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  recordPayment,
  markOverdue,
  exportInvoices,
} from "../controllers/invoice.controller";
import { validate } from "../middleware/validate";
import {
  createInvoiceSchema,
  recordPaymentSchema,
} from "../validation/invoice.validation";

import { authenticate } from "../middleware/authenticate";
import { authorize, authorizePermission } from "../middleware/authorize";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  authorize("admin", "staff"),
  validate(createInvoiceSchema),
  createInvoice,
);

router.get(
  "/",
  authorize("admin", "staff", "client"),
  authorizePermission("invoices:read"),
  getAllInvoices
);

// ─── Export (must come before /:id to avoid route conflict) ──────────────────
router.get(
  "/export",
  authorize("admin", "staff", "client"),
  authorizePermission("invoices:export"),
  exportInvoices
);

router.get(
  "/:id",
  authorize("admin", "staff", "client"),
  authorizePermission("invoices:read"),
  getInvoiceById
);


router.post(
  "/:id/payments",
  authorize("admin", "staff"),
  validate(recordPaymentSchema),
  recordPayment,
);

router.post("/mark-overdue", authorize("admin"), markOverdue);

export default router;
