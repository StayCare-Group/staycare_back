import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { RoleService } from "../services/role.service";
import { ClientSubUserService } from "../services/clientSubUser.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { AppError } from "../utils/AppError";

function ensureClientAccess(
  reqUser: Express.Request["user"],
  targetClientId: string,
  options?: { requireOwner?: boolean }
) {
  if (!reqUser) throw new AppError("Authentication required", 401);
  if (reqUser.role === "admin" || reqUser.role === "staff") return;

  if (options?.requireOwner && reqUser.parentClientId) {
    throw new AppError("Forbidden: Sub-users cannot manage client roles or team members", 403);
  }

  const effectiveClientId = reqUser.parentClientId || reqUser.userId;
  if (String(effectiveClientId) !== String(targetClientId)) {
    throw new AppError("Forbidden: You do not have access to this client's resources", 403);
  }
}

/**
 * @swagger
 * tags:
 *   name: Clients
 *   description: Gestión de clientes, sus roles personalizados y sub-usuarios
 */

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Listar todos los perfiles de cliente (admin)
 *     description: Lista usuarios con rol 'client' junto a su perfil opcional.
 *     tags: [Clients]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: is_active
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de clientes con paginación
 */
export const getAllClients = async (req: Request, res: Response) => {
  try {
    const is_active = req.query.is_active === undefined ? undefined : req.query.is_active === "true";
    const search = req.query.search as string | undefined;
    const { page, limit } = parsePagination(req);

    const filter = { is_active, search };
    const { rows, total } = await UserService.getAllClients(page, limit, filter);

    return sendSuccess(res, 200, "Clients retrieved", rows, paginationMeta(total, page, limit));
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch clients");
  }
};

/**
 * @swagger
 * /api/clients/permissions:
 *   get:
 *     summary: Listar todos los permisos disponibles en el sistema
 *     tags: [Client Roles & Permissions]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de permisos (ej. orders:create, orders:read, orders:update, orders:delete)
 */
export const getAllPermissions = async (req: Request, res: Response) => {
  try {
    const permissions = await RoleService.getAllPermissions();
    return sendSuccess(res, 200, "Permissions retrieved successfully", permissions);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch permissions");
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId);

    const detail = await UserService.getUserDetailByUserId(clientId);
    if (!detail) return sendError(res, 404, "Client not found");
    return sendSuccess(res, 200, "Client retrieved", detail);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch client");
  }
};

export const updateClient = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    await UserService.updateClientProfile(clientId, req.body);
    return sendSuccess(res, 200, "Client updated");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update client");
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    await UserService.deleteUserById(clientId);
    return sendSuccess(res, 200, "Client deleted");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete client");
  }
};

// ─── CUSTOM ROLES ENDPOINTS ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/clients/{id}/roles:
 *   get:
 *     summary: Listar roles asignables para este cliente (Roles del Sistema + Roles Custom del Cliente)
 *     tags: [Client Roles & Permissions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: ID del cliente
 *     responses:
 *       200:
 *         description: Lista de roles disponibles y sus permisos asignados
 */
export const getClientRoles = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId);

    const roles = await RoleService.getClientRoles(clientId);
    return sendSuccess(res, 200, "Client roles retrieved successfully", roles);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch client roles");
  }
};

/**
 * @swagger
 * /api/clients/{id}/roles:
 *   post:
 *     summary: Crear un rol personalizado exclusivo para este cliente
 *     description: Permite al cliente (o admin) crear un rol custom especificando nombre y permisos (`orders:create`, `orders:read`, `orders:update`, `orders:delete`).
 *     tags: [Client Roles & Permissions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Gestor de Pedidos"
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["orders:create", "orders:read", "orders:update"]
 *     responses:
 *       201:
 *         description: Rol custom creado exitosamente
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Ya existe un rol con ese nombre para este cliente
 */
export const createCustomRole = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    const role = await RoleService.createCustomRole(clientId, req.body);
    return sendSuccess(res, 201, "Custom role created successfully", role);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to create custom role");
  }
};

/**
 * @swagger
 * /api/clients/{id}/roles/{roleId}:
 *   put:
 *     summary: Actualizar un rol personalizado del cliente
 *     tags: [Client Roles & Permissions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               permissions: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Rol custom actualizado correctamente
 */
export const updateCustomRole = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const roleId = req.params.roleId as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    const updated = await RoleService.updateCustomRole(clientId, roleId, req.body);
    return sendSuccess(res, 200, "Custom role updated successfully", updated);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update custom role");
  }
};

/**
 * @swagger
 * /api/clients/{id}/roles/{roleId}:
 *   delete:
 *     summary: Eliminar un rol personalizado del cliente
 *     tags: [Client Roles & Permissions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Rol eliminado correctamente
 *       409:
 *         description: No se puede eliminar si hay usuarios con este rol asignado
 */
export const deleteCustomRole = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const roleId = req.params.roleId as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    await RoleService.deleteCustomRole(clientId, roleId);
    return sendSuccess(res, 200, "Custom role deleted successfully");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete custom role");
  }
};

// ─── SUB-USERS ENDPOINTS ─────────────────────────────────────────────────────

/**
 * @swagger
 * /api/clients/{id}/users:
 *   get:
 *     summary: Listar sub-usuarios creados por este cliente
 *     tags: [Client Sub-Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista paginada de usuarios pertenecientes al cliente
 */
export const getClientSubUsers = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId);

    const { page, limit } = parsePagination(req);
    const search = req.query.search as string | undefined;

    const { users, total } = await ClientSubUserService.getSubUsers(clientId, page, limit, search);
    return sendSuccess(res, 200, "Sub-users retrieved successfully", users, paginationMeta(total, page, limit));
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch sub-users");
  }
};

/**
 * @swagger
 * /api/clients/{id}/users/{subUserId}:
 *   get:
 *     summary: Obtener los detalles de un sub-usuario
 *     description: Retorna la información de un sub-usuario, incluyendo sus permisos.
 *     tags: [Client Sub-Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID del cliente (parent)
 *       - in: path
 *         name: subUserId
 *         required: true
 *         schema: { type: string }
 *         description: ID del sub-usuario
 *     responses:
 *       200:
 *         description: Sub-usuario obtenido exitosamente
 *       404:
 *         description: Sub-usuario no encontrado
 */
export const getClientSubUserById = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const subUserId = req.params.subUserId as string;
    ensureClientAccess(req.user, clientId);

    const user = await ClientSubUserService.getSubUserById(clientId, subUserId);
    return sendSuccess(res, 200, "Sub-user retrieved successfully", user);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch sub-user");
  }
};

/**
 * @swagger
 * /api/clients/{id}/users:
 *   post:
 *     summary: Crear un sub-usuario bajo la cuenta de este cliente
 *     description: Permite al cliente (o admin) crear un nuevo usuario y asignarle un rol existente/custom.
 *     tags: [Client Sub-Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role_id]
 *             properties:
 *               name:     { type: string, example: "Carlos Empleado" }
 *               email:    { type: string, example: "carlos@empresa.com" }
 *               password: { type: string, example: "password123" }
 *               phone:    { type: string, example: "+51999888777" }
 *               language: { type: string, enum: [en, es] }
 *               role_id:  { type: string, format: uuid, description: "ID del rol (system o custom)" }
 *     responses:
 *       201:
 *         description: Sub-usuario creado exitosamente
 *       400:
 *         description: Error de validación
 *       409:
 *         description: El email o teléfono ya están registrados
 */
export const createClientSubUser = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    const user = await ClientSubUserService.createSubUser(clientId, req.body);
    return sendSuccess(res, 201, "Sub-user created successfully", user);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to create sub-user");
  }
};

/**
 * @swagger
 * /api/clients/{id}/users/{subUserId}:
 *   put:
 *     summary: Actualizar datos de un sub-usuario del cliente
 *     tags: [Client Sub-Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: subUserId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:      { type: string }
 *               email:     { type: string }
 *               password:  { type: string }
 *               phone:     { type: string }
 *               language:  { type: string, enum: [en, es] }
 *               role_id:   { type: string, format: uuid }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Sub-usuario actualizado
 */
export const updateClientSubUser = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const subUserId = req.params.subUserId as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    const updated = await ClientSubUserService.updateSubUser(clientId, subUserId, req.body);
    return sendSuccess(res, 200, "Sub-user updated successfully", updated);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update sub-user");
  }
};

/**
 * @swagger
 * /api/clients/{id}/users/{subUserId}:
 *   delete:
 *     summary: Eliminar un sub-usuario de este cliente
 *     tags: [Client Sub-Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: subUserId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sub-usuario eliminado exitosamente
 */
export const deleteClientSubUser = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const subUserId = req.params.subUserId as string;
    ensureClientAccess(req.user, clientId, { requireOwner: true });

    await ClientSubUserService.deleteSubUser(clientId, subUserId);
    return sendSuccess(res, 200, "Sub-user deleted successfully");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete sub-user");
  }
};
