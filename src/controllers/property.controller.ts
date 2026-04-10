import { Request, Response } from "express";
import { PropertyService } from "../services/property.service";
import { sendSuccess, sendError } from "../utils/response";
import { AppError } from "../utils/AppError";

/**
 * @swagger
 * tags:
 *   name: Properties
 *   description: Gestión de sedes (propiedades) de los clientes.
 */

/**
 * @swagger
 * /api/properties/user/{userId}:
 *   get:
 *     summary: Obtener sedes de un usuario (Admin, Staff o Dueño)
 *     description: Si userId es "me", devuelve las sedes del usuario autenticado. Los clientes solo pueden ver sus propias sedes. Los administradores y trabajadores (Staff) pueden ver las sedes de cualquier usuario.
 *     tags: [Properties]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: ID numérico del usuario o "me"
 *     responses:
 *       200:
 *         description: Lista de sedes del usuario
 */
export const getUserProperties = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.userId as string;
    let userId: string;

    if (rawId === "me") {
      userId = req.user!.userId;
    } else {
      userId = rawId;

      // Permission check: if not admin or staff, can only see their own properties
      if (req.user!.role !== "admin" && req.user!.role !== "staff" && userId !== req.user!.userId) {
        return sendError(res, 403, "Forbidden: You can only view your own properties");
      }
    }

    const properties = await PropertyService.listByUserId(userId);
    return sendSuccess(res, 200, "Properties retrieved", properties);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to fetch properties");
  }
};


/**
 * @swagger
 * /api/properties:
 *   post:
 *     summary: Añadir sede propia (Cliente)
 *     tags: [Properties]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PropertyInput'
 *     responses:
 *       201:
 *         description: Sede creada
 */
export const addProperty = async (req: Request, res: Response) => {
  try {
    const idParam = (req.params.userId || "me") as string;
    let userId: string;

    if (idParam === "me") {
      userId = req.user!.userId;
    } else {
      userId = idParam;

      // Permission check: only admin can add property to other users
      if (req.user!.role !== "admin" && userId !== req.user!.userId) {
        return sendError(res, 403, "Forbidden");
      }
    }

    const created = await PropertyService.addPropertyForClientUser(userId, req.body);
    return sendSuccess(res, 201, "Property added", created);
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to add property");
  }
};


/**
 * @swagger
 * /api/properties/user/{userId}:
 *   post:
 *     summary: Añadir sede a un usuario específico (Admin, Cliente)
 *     tags: [Properties]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PropertyInput'
 *     responses:
 *       201:
 *         description: Sede creada
 */
// Handled by the same function (addProperty) in the router

// getUserProperties doc moved to line 13-34 and updated to handle 'me'


/**
 * @swagger
 * /api/properties/{id}:
 *   put:
 *     summary: Actualizar sede (Dueño o Admin)
 *     tags: [Properties]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PropertyInput'
 *     responses:
 *       200:
 *         description: Sede actualizada
 */
export const updateProperty = async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id as string;

    const userId = req.user!.role === "admin" ? undefined : req.user!.userId;

    await PropertyService.updateProperty(propertyId, req.body, userId);
    return sendSuccess(res, 200, "Property updated");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update property");
  }
};

/**
 * @swagger
 * /api/properties/{id}:
 *   delete:
 *     summary: Eliminar sede (Dueño o Admin)
 *     tags: [Properties]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sede eliminada
 */
export const deleteProperty = async (req: Request, res: Response) => {
  try {
    const propertyId = req.params.id as string;

    const userId = req.user!.role === "admin" ? undefined : req.user!.userId;

    await PropertyService.deleteProperty(propertyId, userId);
    return sendSuccess(res, 200, "Property deleted");
  } catch (error: unknown) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete property");
  }
};
