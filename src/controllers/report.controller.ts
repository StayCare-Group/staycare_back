import { Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { sendSuccess, sendError } from "../utils/response";

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Consultas analíticas y estadísticas del sistema
 */

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Estadísticas generales para el dashboard principal
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats (orders, clients, drivers, monthly revenue)
 */
export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const stats = await ReportService.getDashboardStats();
    return sendSuccess(res, 200, "Dashboard stats", stats);
  } catch (error) {
    console.error("getDashboardStats error:", error);
    return sendError(res, 500, "Failed to fetch dashboard stats");
  }
};

/**
 * @swagger
 * /api/reports/revenue:
 *   get:
 *     summary: Ingresos mensuales agregados
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200:
 *         description: Lista de ingresos por mes
   */
export const getRevenueByMonth = async (req: Request, res: Response) => {
  try {
    const months = parseInt(req.query.months as string) || 12;
    const data = await ReportService.getRevenueByMonth(months);
    return sendSuccess(res, 200, "Revenue by month", data);
  } catch (error) {
    console.error("getRevenueByMonth error:", error);
    return sendError(res, 500, "Failed to fetch revenue data");
  }
};

/**
 * @swagger
 * /api/reports/clients:
 *   get:
 *     summary: Ranking de clientes por volumen y facturación
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Top clientes
 */
export const getOrdersByClient = async (_req: Request, res: Response) => {
  try {
    const data = await ReportService.getOrdersByClient();
    return sendSuccess(res, 200, "Orders by client", data);
  } catch (error) {
    console.error("getOrdersByClient error:", error);
    return sendError(res, 500, "Failed to fetch orders by client");
  }
};

/**
 * @swagger
 * /api/reports/sla:
 *   get:
 *     summary: Métricas de cumplimiento de tiempos (SLA)
 *     description: Calcula % on-time vs late vs critical y tiempos promedio de procesamiento y reparto.
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: SLA metrics
 */
export const getSlaMetrics = async (_req: Request, res: Response) => {
  try {
    const metrics = await ReportService.getSlaMetrics();
    return sendSuccess(res, 200, "SLA metrics", metrics);
  } catch (error) {
    console.error("getSlaMetrics error:", error);
    return sendError(res, 500, "Failed to fetch SLA metrics");
  }
};
