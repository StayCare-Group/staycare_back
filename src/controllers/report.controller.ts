import { Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { sendSuccess, sendError } from "../utils/response";
import { dashboardFiltersQuerySchema } from "../validation/report.validation";

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
 * /api/reports/dashboard/overview:
 *   get:
 *     summary: KPIs del dashboard admin (órdenes recibidas e ítems por grupo de estado)
 *     description: |
 *       Cuenta las órdenes creadas dentro del rango (por `created_at`) y suma la cantidad de
 *       ítems de esas órdenes agrupados en pendientes, procesados y entregados. Las órdenes
 *       canceladas se excluyen. `from` y `to` son días calendario inclusivos en hora de Malta
 *       (rango máximo 366 días).
 *     tags: [Reports]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date, example: "2026-11-01" }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date, example: "2026-11-30" }
 *       - in: query
 *         name: clientId
 *         required: false
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: "{ ordersReceived, itemsTotal, itemsPending, itemsProcessed, itemsDelivered }"
 *       400:
 *         description: Filtros inválidos
 *       403:
 *         description: Solo admin
 */
export const getDashboardOverview = async (req: Request, res: Response) => {
  const filters = dashboardFiltersQuerySchema.safeParse(req.query);
  if (!filters.success) {
    return sendError(res, 400, "Validation failed. Invalid dashboard filters.", filters.error.issues);
  }

  try {
    const overview = await ReportService.getDashboardOverview(filters.data);
    return sendSuccess(res, 200, "Dashboard overview", overview);
  } catch (error) {
    console.error("getDashboardOverview error:", error);
    return sendError(res, 500, "Failed to fetch dashboard overview");
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
