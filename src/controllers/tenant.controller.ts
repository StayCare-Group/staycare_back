import type { Request, Response } from "express";
import { TenantService } from "../services/tenant.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { AppError } from "../utils/AppError";

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Gestión Multi-tenant y Roles Dinámicos
 */

/**
 * @swagger
 * /api/tenants:
 *   get:
 *     summary: Listar todos los clientes/tenants (Super-Admin)
 *     tags: [Tenants]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de Tenants
 */
export const getAllTenants = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePagination(req);
    const { tenants, total } = await TenantService.getAllTenants(page, limit);

    return sendSuccess(
      res,
      200,
      "Tenants retrieved successfully",
      tenants,
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    return sendError(res, 400, "Failed to fetch tenants");
  }
};

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Crear un nuevo Tenant (Super-Admin)
 *     tags: [Tenants]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantInput'
 *     responses:
 *       201:
 *         description: Tenant creado exitosamente
 */
export const createTenant = async (req: Request, res: Response) => {
  try {
    const tenant = await TenantService.createTenant(req.body);
    return sendSuccess(res, 201, "Tenant created successfully", tenant);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    console.error("createTenant:", error);
    return sendError(res, 400, "Failed to create tenant");
  }
};

/**
 * @swagger
 * /api/tenants/{tenantId}/roles:
 *   get:
 *     summary: Listar roles asignables para un Tenant (Base + Dinámicos)
 *     tags: [Tenants]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lista de roles para el Tenant
 */
export const getTenantRoles = async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    if (!tenantId) {
      return sendError(res, 400, "Invalid tenant id");
    }

    if (req.user!.role !== "admin" && req.user!.tenantId !== tenantId) {
      throw new AppError("No tienes permiso para ver roles de este Tenant", 403);
    }
    const roles = await TenantService.getTenantRoles(tenantId);
    return sendSuccess(res, 200, "Tenant roles retrieved successfully", roles);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    console.error("getTenantRoles:", error);
    return sendError(res, 400, "Failed to fetch tenant roles");
  }
};

/**
 * @swagger
 * /api/tenants/{tenantId}/roles:
 *   post:
 *     summary: Crear un rol dinámico exclusivo para el Tenant
 *     tags: [Tenants]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomRoleInput'
 *     responses:
 *       201:
 *         description: Rol creado exitosamente
 */
export const createCustomRole = async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    if (!tenantId) {
      return sendError(res, 400, "Invalid tenant id");
    }

    if (req.user!.role !== "admin" && req.user!.tenantId !== tenantId) {
      throw new AppError("No tienes permiso para gestionar roles de este Tenant", 403);
    }

    const role = await TenantService.createCustomRole(tenantId, req.body);
    return sendSuccess(res, 201, "Custom role created successfully", role);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    console.error("createCustomRole:", error);
    return sendError(res, 400, "Failed to create custom role");
  }
};
