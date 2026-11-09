import { Router } from "express";
import {
  getDashboardStats,
  getDashboardOverview,
  getRevenueByMonth,
  getOrdersByClient,
  getSlaMetrics,
} from "../controllers/report.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

router.get("/dashboard", getDashboardStats);
router.get("/dashboard/overview", getDashboardOverview);
router.get("/revenue", getRevenueByMonth);
router.get("/orders-by-client", getOrdersByClient);
router.get("/sla", getSlaMetrics);

export default router;
