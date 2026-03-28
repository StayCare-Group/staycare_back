import { Request, Response } from "express";
import { ItemService } from "../services/item.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

/**
 * @swagger
 * tags:
 *   name: Items
 *   description: Catálogo de ítems y servicios de lavandería
 */

/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Crear un nuevo ítem en el catálogo (admin)
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [item_code, name, base_price]
 *             properties:
 *               item_code: { type: string, example: "SHT-S" }
 *               name:      { type: string, example: "Single Sheet" }
 *               base_price: { type: number, example: 5.50 }
 *     responses:
 *       201:
 *         description: Ítem creado
 *       409:
 *         description: El código de ítem ya existe
 */
export const createItem = async (req: Request, res: Response) => {
  try {
    const item = await ItemService.createItem(req.body);
    return sendSuccess(res, 201, "Item created", item);
  } catch (error: any) {
    if (error.message === "Item code already exists") {
      return sendError(res, 409, error.message);
    }
    return sendError(res, 400, "Item creation failed");
  }
};

/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Listar todos los ítems del catálogo
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por código o nombre
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
 *         description: Lista de ítems con paginación
 */
export const getAllItems = async (req: Request, res: Response) => {
  try {
    const is_active = req.query.is_active === undefined ? undefined : req.query.is_active === "true";
    const search = req.query.search as string | undefined;
    const { page, limit, skip } = parsePagination(req);
    
    const { items, total } = await ItemService.getAllItems(is_active, limit, skip, search);
    
    // Map items to ensure is_active is boolean
    const mappedItems = items.map((item) => ({
      ...item,
      is_active: !!item.is_active,
    }));

    return sendSuccess(
      res,
      200,
      "Items retrieved",
      mappedItems,
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    console.error("getAllItems error:", error);
    return sendError(res, 400, "Failed to fetch items");
  }
};



/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Obtener detalle de un ítem
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle del ítem
 */
export const getItemById = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id as string;
    const item = await ItemService.getItemById(itemId);
    if (!item) return sendError(res, 404, "Item not found");
    return sendSuccess(res, 200, "Item retrieved", item);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch item");
  }
};

/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Actualizar un ítem (admin)
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               item_code: { type: string }
 *               name: { type: string }
 *               base_price: { type: number }
 *               is_active: { type: boolean }
 *     responses:
 *       200:
 *         description: Ítem actualizado
 */

export const updateItem = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id as string;
    const item = await ItemService.updateItem(itemId, req.body);
    if (!item) return sendError(res, 404, "Item not found");
    return sendSuccess(res, 200, "Item updated", item);
  } catch (error) {
    return sendError(res, 400, "Item update failed");
  }
};

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Eliminar un ítem (admin)
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ítem eliminado
 */
export const deleteItem = async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id as string;
    await ItemService.deleteItem(itemId);
    return sendSuccess(res, 200, "Item deleted");
  } catch (error) {
    return sendError(res, 400, "Item deletion failed");
  }
};

/**
 * @swagger
 * /api/items/seed:
 *   post:
 *     summary: Poblado inicial de ítems por defecto (admin)
 *     tags: [Items]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Resultado del seed
 */
export const seedItems = async (_req: Request, res: Response) => {
  try {
    const createdCount = await ItemService.seedItems();
    return sendSuccess(res, 200, `Seeded ${createdCount} items`);
  } catch (error) {
    return sendError(res, 400, "Seed failed");
  }
};
