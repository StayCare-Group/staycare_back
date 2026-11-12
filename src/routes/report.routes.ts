import { Router } from "express";
import {
  getDashboardStats,
  getDashboardOverview,
  getDashboardDailyOrders,
  getDashboardAlerts,
  getDashboardComparison,
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
router.get("/dashboard/daily-orders", getDashboardDailyOrders);
router.get("/dashboard/alerts", getDashboardAlerts);
router.get("/dashboard/comparison", getDashboardComparison);
router.get("/revenue", getRevenueByMonth);
router.get("/orders-by-client", getOrdersByClient);
router.get("/sla", getSlaMetrics);

export default router;
