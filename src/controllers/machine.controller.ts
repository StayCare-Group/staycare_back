import { Request, Response } from "express";
import { MachineService } from "../services/machine.service";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

/**
 * @swagger
 * tags:
 *   name: Machines
 *   description: Gestión de maquinaria de lavandería (lavadoras, secadoras, planchas)
 */

/**
 * @swagger
 * /api/machines:
 *   get:
 *     summary: Listar todas las máquinas con su estado actual
 *     description: Devuelve el listado ordenado por tipo y nombre. Si la máquina está en uso, incluye `order_number` y `order_status` del pedido asignado.
 *     tags: [Machines]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por nombre de máquina
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [washer, dryer, iron] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [available, running, maintenance] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de máquinas con paginación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:               { type: integer }
 *                       name:             { type: string }
 *                       type:             { type: string, enum: [washer, dryer, iron] }
 *                       capacity:         { type: number, description: "Capacidad en kg" }
 *                       status:           { type: string, enum: [available, running, maintenance] }
 *                       current_order_id: { type: integer, nullable: true }
 *                       order_number:     { type: string, nullable: true }
 *                       order_status:     { type: string, nullable: true }
 *                       started_at:       { type: string, format: date-time, nullable: true }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol sin permiso
 */
export const getMachineStatus = async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const type = req.query.type as any;
    const status = req.query.status as any;

    const { page, limit, skip } = parsePagination(req);
    const { machines, total } = await MachineService.getAllMachines(limit, skip, { search, type, status });
    
    return sendSuccess(
      res, 
      200, 
      "Facility machine status", 
      machines,
      paginationMeta(total, page, limit)
    );
  } catch (error) {
    return sendError(res, 500, "Failed to fetch machine status");
  }
};

/**
 * @swagger
 * /api/machines:
 *   post:
 *     summary: Crear una nueva máquina (admin)
 *     tags: [Machines]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, capacity]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Washer #4"
 *               type:
 *                 type: string
 *                 enum: [washer, dryer, iron]
 *               capacity:
 *                 type: number
 *                 description: Capacidad en kg
 *                 example: 20
 *     responses:
 *       201:
 *         description: Máquina creada
 *       400:
 *         description: Error de creación
 *       409:
 *         description: Ya existe una máquina con ese nombre
 */
export const createMachine = async (req: Request, res: Response) => {
  try {
    const machine = await MachineService.createMachine(req.body);
    return sendSuccess(res, 201, "Machine created", machine);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "A machine with that name already exists");
    }
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Machine creation failed");
  }
};

/**
 * @swagger
 * /api/machines/{id}:
 *   put:
 *     summary: Actualizar datos de una máquina (admin)
 *     tags: [Machines]
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
 *               name:     { type: string }
 *               type:     { type: string, enum: [washer, dryer, iron] }
 *               capacity: { type: number }
 *               status:   { type: string, enum: [available, running, maintenance] }
 *     responses:
 *       200:
 *         description: Máquina actualizada
 *       404:
 *         description: Máquina no encontrada
 */
export const updateMachine = async (req: Request, res: Response) => {
  try {
    const machine = await MachineService.updateMachine(req.params.id, req.body);
    return sendSuccess(res, 200, "Machine updated", machine);
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Machine update failed");
  }
};

/**
 * @swagger
 * /api/machines/{id}:
 *   delete:
 *     summary: Eliminar una máquina (admin)
 *     description: No se puede eliminar una máquina con estado `running`.
 *     tags: [Machines]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Máquina eliminada
 *       400:
 *         description: Máquina en uso
 *       404:
 *         description: Máquina no encontrada
 */
export const deleteMachine = async (req: Request, res: Response) => {
  try {
    await MachineService.deleteMachine(req.params.id);
    return sendSuccess(res, 200, "Machine deleted");
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Machine deletion failed");
  }
};

/**
 * @swagger
 * /api/machines/{id}/assign:
 *   post:
 *     summary: Asignar una máquina a un pedido (admin / staff)
 *     description: Cambia el estado de la máquina a `running` y registra el pedido y hora de inicio.
 *     tags: [Machines]
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
 *             required: [order_id]
 *             properties:
 *               order_id:
 *                 type: integer
 *                 description: ID del pedido a procesar
 *     responses:
 *       200:
 *         description: Máquina asignada al pedido
 *       400:
 *         description: Máquina no disponible (running o maintenance)
 *       404:
 *         description: Máquina u orden no encontrada
 */
export const assignMachine = async (req: Request, res: Response) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return sendError(res, 400, "order_id is required");

    const machine = await MachineService.assignMachine(req.params.id, String(order_id));
    return sendSuccess(res, 200, "Machine assigned", machine);
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Machine assignment failed");
  }
};

/**
 * @swagger
 * /api/machines/{id}/release:
 *   post:
 *     summary: Liberar una máquina (admin / staff)
 *     description: Cambia el estado a `available` y limpia el pedido asignado y hora de inicio.
 *     tags: [Machines]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Máquina liberada
 *       404:
 *         description: Máquina no encontrada
 */
export const releaseMachine = async (req: Request, res: Response) => {
  try {
    const machine = await MachineService.releaseMachine(req.params.id);
    return sendSuccess(res, 200, "Machine released", machine);
  } catch (error: any) {
    const status = error.status ?? 400;
    return sendError(res, status, error.message || "Machine release failed");
  }
};

/**
 * @swagger
 * /api/machines/seed:
 *   post:
 *     summary: Poblar máquinas por defecto (admin / staff)
 *     description: |
 *       Inserta 8 máquinas predefinidas si la tabla está vacía:
 *       3 lavadoras, 3 secadoras, 2 planchas. Idempotente — si ya existen máquinas no hace nada.
 *     tags: [Machines]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Máquinas ya existentes (no se seeded)
 *       201:
 *         description: Máquinas insertadas correctamente
 */
export const seedMachines = async (_req: Request, res: Response) => {
  try {
    const result = await MachineService.seedMachines();
    if (!result.seeded) {
      return sendSuccess(res, 200, "Machines already seeded", { count: result.count });
    }
    return sendSuccess(res, 201, "Machines seeded", { count: result.count });
  } catch (error) {
    return sendError(res, 500, "Machine seeding failed");
  }
};
