import { Request, Response } from "express";
import { RouteService } from "../services/route.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { AppError } from "../utils/AppError";

/**
 * @swagger
 * tags:
 *   name: Routes
 *   description: Gestión de rutas de reparto diarias
 */

/**
 * @swagger
 * /api/routes:
 *   post:
 *     summary: Crear una nueva ruta de reparto (admin)
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [route_date, driver_id, area]
 *             properties:
 *               route_date: { type: string, format: date }
 *               driver_id:  { type: integer }
 *               area:       { type: string }
 *               order_ids:  { type: array, items: { type: integer } }
 *     responses:
 *       201:
 *         description: Ruta creada
 */
export const createRoute = async (req: Request, res: Response) => {
  try {
    const route = await RouteService.createRoute(req.body);
    return sendSuccess(res, 201, "Route created", route);
  } catch (error) {
    return sendError(res, 400, "Route creation failed");
  }
};

/**
 * @swagger
 * /api/routes:
 *   get:
 *     summary: Listar rutas de reparto (paginado + filtros)
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planned, in_progress, completed] }
 *       - in: query
 *         name: driver
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por área (coincidencia parcial)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de rutas con paginación
 */
export const getAllRoutes = async (req: Request, res: Response) => {
  try {
    const { status, driver, area, date, search } = req.query;
    const { page, limit, skip } = parsePagination(req);
    const filter: any = {};

    if (status) filter.status = status;
    if (area) filter.area = area;
    if (date) filter.date = date;
    if (search) filter.search = search;

    if (req.user!.role === "driver") {
      filter.driver_id = Number(req.user!.userId);
    } else if (driver) {
      filter.driver_id = Number(driver);
    }

    const { routes, total } = await RouteService.listRoutes(filter, limit, skip);

    return sendSuccess(
      res,
      200, 
      "Routes retrieved", 
      routes, 
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    console.error("getAllRoutes error:", error);
    return sendError(res, 400, "Failed to fetch routes");
  }
};


/**
 * @swagger
 * /api/routes/{id}:
 *   get:
 *     summary: Obtener detalle de una ruta por id
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle de la ruta con pedidos asignados
 */
export const getRouteById = async (req: Request, res: Response) => {
  try {
    const routeId = req.params.id as string;
    const route = await RouteService.getRouteById(routeId);
    return sendSuccess(res, 200, "Route retrieved", route);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch route");
  }
};

/**
 * @swagger
 * /api/routes/{id}:
 *   put:
 *     summary: Actualizar datos de una ruta (admin)
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ruta actualizada
 */
export const updateRoute = async (req: Request, res: Response) => {
  try {
    const routeId = req.params.id as string;
    const route = await RouteService.updateRoute(routeId, req.body);
    return sendSuccess(res, 200, "Route updated", route);
  } catch (error) {
    return sendError(res, 400, "Route update failed");
  }
};

/**
 * @swagger
 * /api/routes/{id}/status:
 *   patch:
 *     summary: Cambiar el estado de una ruta (driver / admin)
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [planned, in_progress, completed] }
 *     responses:
 *       200:
 *         description: Estado de la ruta actualizado
 */
export const updateRouteStatus = async (req: Request, res: Response) => {
  try {
    const routeId = req.params.id as string;
    const route = await RouteService.updateRoute(routeId, { status: req.body.status });
    return sendSuccess(res, 200, "Route status updated", route);
  } catch (error) {
    return sendError(res, 400, "Route status update failed");
  }
};

/**
 * @swagger
 * /api/routes/{id}:
 *   delete:
 *     summary: Eliminar una ruta de reparto (solo admin, solo en estado planned)
 *     tags: [Routes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ruta eliminada
 */
export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const routeId = req.params.id as string;
    await RouteService.deleteRoute(routeId);
    return sendSuccess(res, 200, "Route deleted");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Route deletion failed");
  }
};
