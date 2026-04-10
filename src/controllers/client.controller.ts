import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { AppError } from "../utils/AppError";


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
 *         description: Buscar por contacto, VAT, nombre o email
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

    const filter: { is_active?: boolean | undefined; search?: string | undefined } = {
      is_active,
      search,
    };

    const { rows, total } = await UserService.getAllClients(page, limit, filter);

    return sendSuccess(res, 200, "Clients retrieved", rows, paginationMeta(total, page, limit));

  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch clients");
  }
};


export const getClientById = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Check ownership if client
    if (req.user!.role === "client") {
      const isOwner = await UserService.userOwnsProfile(req.user!.userId, userId as string);
      if (!isOwner) return sendError(res, 403, "Forbidden");
    }

    const detail = await UserService.getUserDetailByUserId(userId as string);
    if (!detail) return sendError(res, 404, "Client not found");
    return sendSuccess(res, 200, "Client retrieved", detail);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch client");
  }
};

export const updateClient = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Check ownership if client
    if (req.user!.role === "client") {
      const isOwner = await UserService.userOwnsProfile(req.user!.userId, userId as string);
      if (!isOwner) return sendError(res, 403, "Forbidden");
    }

    await UserService.updateClientProfile(userId as string, req.body);
    return sendSuccess(res, 200, "Client updated");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update client");
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    await UserService.deleteUserById(userId as string);
    return sendSuccess(res, 200, "Client deleted");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete client");
  }
};
