import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { OrderStatus } from "../types/orderStatus";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { AppError } from "../utils/AppError";

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Gestión de pedidos de lavandería — ciclo completo de vida
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Crear un pedido
 *     description: Disponible para **admin**, **staff** y **client**. Los clientes tienen su `client_id` resuelto automáticamente desde su perfil vinculado.
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pickup_date, pickup_window, service_type]
 *             properties:
 *               client_id:
 *                 type: integer
 *                 description: Requerido si el rol es admin o staff
 *               property_id:
 *                 type: integer
 *                 nullable: true
 *               service_type:
 *                 type: string
 *                 enum: [standard, express]
 *               pickup_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-01"
 *               pickup_window:
 *                 type: object
 *                 required: [start_time, end_time]
 *                 properties:
 *                   start_time: { type: string, format: date-time }
 *                   end_time:   { type: string, format: date-time }
 *               estimated_bags:
 *                 type: integer
 *                 nullable: true
 *               special_notes:
 *                 type: string
 *                 nullable: true
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [item_id, quantity]
 *                   properties:
 *                     item_id:     { type: integer }
 *                     quantity:    { type: integer }
 *     responses:
 *       201:
 *         description: Pedido creado con estado PENDING
 *       400:
 *         description: Error de validación o creación
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol sin permiso
 */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user!.userId);
    const order = await OrderService.createOrder(req.body, userId, req.user!.role);
    return sendSuccess(res, 201, "Order created", order);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Order creation failed");
  }
};

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Listar pedidos (paginado + filtros)
 *     description: |
 *       - **admin / staff**: ven todos los pedidos. Pueden filtrar por `client_id`.
 *       - **driver**: ve solo los pedidos asignados a él.
 *       - **client**: filtro automático por su perfil de cliente.
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, transit, arrived, washing, drying, ironing, quality_check, ready_to_delivery, collected, delivered, invoiced, completed, cancelled, rescheduled]
 *       - in: query
 *         name: client_id
 *         schema: { type: integer }
 *       - in: query
 *         name: service_type
 *         schema: { type: string, enum: [standard, express] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar por número de pedido o nombre de cliente
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista paginada de pedidos
 *       401:
 *         description: No autenticado
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { status, client_id, service_type, from, to, pickup_from, pickup_to, search } = req.query;
    const { page, limit, skip } = parsePagination(req);
    const filter: any = { status, client_id, service_type, from, to, pickup_from, pickup_to, search };

    // 1. Admin: Si busca pendientes de asignación, eliminamos restricción de fecha por defecto
    if (req.user!.role === "admin" && status === OrderStatus.PENDING) {
      delete filter.from;
      delete filter.to;
      delete filter.pickup_from;
      delete filter.pickup_to;
    }

    // 2. Driver: Ver todas sus órdenes activas (no entregadas/finalizadas)
    if (req.user!.role === "driver") {
      filter.driver_id = Number(req.user!.userId);

      // Si el driver no especifica un estado puntual, le mostramos todo lo "abierto"
      if (!status) {
        filter.status = [
          OrderStatus.ASSIGNED,
          OrderStatus.TRANSIT,
          OrderStatus.ARRIVED,
          OrderStatus.WASHING,
          OrderStatus.DRYING,
          OrderStatus.IRONING,
          OrderStatus.QUALITY_CHECK,
          OrderStatus.READY_TO_DELIVERY,
          OrderStatus.COLLECTED,
          OrderStatus.RESCHEDULED
        ];

        // El driver debe ver todo lo abierto sin importar la fecha
        delete filter.from;
        delete filter.to;
        delete filter.pickup_from;
        delete filter.pickup_to;
      }
    }

    const { orders, total } = await OrderService.getAllOrders(filter, limit, skip);

    return sendSuccess(
      res,
      200,
      "Orders retrieved",
      orders,
      paginationMeta(total, page, limit)
    );
  } catch (error: any) {
    console.error("getAllOrders error:", error);
    return sendError(res, 400, error.message || "Failed to fetch orders");
  }
};


/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Obtener detalle de un pedido por ID
 *     description: Incluye `items`, `status_history` y datos del cliente / driver / propiedad.
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalle del pedido
 *       400:
 *         description: ID inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Pedido no encontrado
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return sendError(res, 400, "Invalid order ID");
    const order = await OrderService.getOrderById(orderId);
    return sendSuccess(res, 200, "Order retrieved", order);
  } catch (error: any) {
    return sendError(res, 400, "Failed to fetch order");
  }
};

/**
 * @swagger
 * /api/orders/{id}:
 *   put:
 *     summary: Actualizar datos generales de un pedido (admin / staff)
 *     tags: [Orders]
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
 *               special_notes:  { type: string }
 *               estimated_bags: { type: integer }
 *               service_type:   { type: string, enum: [standard, express] }
 *     responses:
 *       200:
 *         description: Pedido actualizado
 *       400:
 *         description: Error de actualización
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No es admin o staff
 */
export const updateOrder = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user!.userId);
    const order = await OrderService.updateOrder(Number(req.params.id), req.body, userId);
    return sendSuccess(res, 200, "Order updated", order);
  } catch (error: any) {
    return sendError(res, 400, "Order update failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Avanzar el estado de un pedido
 *     description: |
 *       **Endpoint único** para todas las transiciones de estado. El servicio valida el rol
 *       permitido para cada estado destino y ejecuta la lógica especializada correspondiente:
 *
 *       | Status destino | Roles permitidos | Campos extra requeridos |
 *       |---|---|---|
 *       | `transit` | driver, admin | `actual_bags` (req), `photos`?, `notes`? |
 *       | `arrived` | staff, admin | `internal_notes`? |
 *       | `washing` `drying` `ironing` `quality_check` `ready_to_delivery` | staff, admin | `note`? |
 *       | `collected` | driver, admin | — |
 *       | `delivered` | driver, admin | `photos`?, `notes`? |
 *       | `pending` `cancelled` `completed` `invoiced` `assigned` | admin, staff | `note`? |
 *     tags: [Orders]
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
 *               status:
 *                 type: string
 *                 enum: [pending, assigned, transit, arrived, washing, drying, ironing, quality_check, ready_to_delivery, collected, delivered, invoiced, completed, cancelled]
 *               actual_bags:
 *                 type: integer
 *                 description: Requerido cuando status = transit
 *               photos:
 *                 type: array
 *                 description: Para transit (before) o delivered (after)
 *                 items:
 *                   type: object
 *                   properties:
 *                     url: { type: string, format: uri }
 *               notes:
 *                 type: string
 *                 description: Nota de recogida o entrega
 *               internal_notes:
 *                 type: string
 *                 description: Nota interna de staff al recibir en facility
 *               note:
 *                 type: string
 *                 description: Nota genérica registrada en el historial de estado
 *     responses:
 *       200:
 *         description: Estado actualizado correctamente
 *       400:
 *         description: Rol no autorizado para ese estado o datos inválidos
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Forbidden
 */
export const advanceOrderStatus = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return sendError(res, 400, "Invalid order ID");

    const { status, ...payload } = req.body;
    const userId = Number(req.user!.userId);

    const order = await OrderService.advanceStatus(orderId, status, payload, userId, req.user!.role);
    return sendSuccess(res, 200, "Order status updated", order);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Status update failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}:
 *   delete:
 *     summary: Eliminar un pedido (solo admin)
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Pedido eliminado
 *       400:
 *         description: Error al eliminar
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No es admin
 */
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    await OrderService.deleteOrder(Number(req.params.id));
    return sendSuccess(res, 200, "Order deleted");
  } catch (error: any) {
    return sendError(res, 400, "Order deletion failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}/reschedule:
 *   patch:
 *     summary: Reprogramar fecha de recogida
 *     description: |
 *       Disponible para **admin**, **staff** y el propio **client**.
 *       Si el pedido estaba `assigned`, vuelve a `pending` y libera al conductor.
 *     tags: [Orders]
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
 *             required: [pickup_date, pickup_window]
 *             properties:
 *               pickup_date:
 *                 type: string
 *                 format: date
 *               pickup_window:
 *                 type: object
 *                 required: [start_time, end_time]
 *                 properties:
 *                   start_time: { type: string, format: date-time }
 *                   end_time:   { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Pedido reprogramado
 *       400:
 *         description: Error al reprogramar
 *       401:
 *         description: No autenticado
 */
export const rescheduleOrder = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user!.userId);
    const order = await OrderService.rescheduleOrder(Number(req.params.id), req.body, userId);
    return sendSuccess(res, 200, "Order rescheduled", order);
  } catch (error: any) {
    return sendError(res, 400, "Reschedule failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}/reassign:
 *   patch:
 *     summary: Reasignar pedido a otro conductor (solo admin)
 *     description: |
 *       Elimina la asignación anterior de ruta, busca o crea una ruta planificada para el
 *       nuevo conductor en la misma fecha y asigna el pedido. Estado → `assigned`.
 *     tags: [Orders]
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
 *             required: [driver_id]
 *             properties:
 *               driver_id:
 *                 type: integer
 *                 description: ID del usuario conductor destino
 *     responses:
 *       200:
 *         description: Pedido reasignado al nuevo conductor
 *       400:
 *         description: Driver no encontrado o error
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No es admin
 */
export const reassignOrder = async (req: Request, res: Response) => {
  try {
    const { driver_id } = req.body;
    const userId = Number(req.user!.userId);
    const order = await OrderService.reassignOrder(
      Number(req.params.id),
      Number(driver_id),
      userId,
      req.user!.role
    );
    return sendSuccess(res, 200, "Order reassigned", order);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Reassignment failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}/receive:
 *   patch:
 *     summary: Confirmar recepción en planta e inventario (solo staff/admin)
 *     description: |
 *       El personal de planta confirma cuántas bolsas recibe físicamente y realiza un
 *       conteo de ítems según su estado (buen estado, mal estado, manchado).
 *       Estado → `Arrived`.
 *     tags: [Orders]
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
 *             required: [staff_confirmed_bags, items]
 *             properties:
 *               staff_confirmed_bags: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [item_id, quantity, qty_good, qty_bad, qty_stained]
 *                   properties:
 *                     item_id: { type: integer, description: "ID del catálogo de artículos" }
 *                     quantity: { type: integer, description: "Cantidad total recibida" }
 *                     qty_good: { type: integer }
 *                     qty_bad: { type: integer }
 *                     qty_stained: { type: integer }
 *     responses:
 *       200:
 *         description: Recepción confirmada
 *       400:
 *         description: Error en la recepción
 *       401:
 *         description: No autenticado
 */
export const receiveOrder = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.user!.userId);
    const orderId = Number(req.params.id);
    const order = await OrderService.receiveInPlant(orderId, userId, req.body);
    return sendSuccess(res, 200, "Order received in plant and inventory recorded", order);
  } catch (error: any) {
    return sendError(res, 400, error.message || "Reception failed");
  }
};

/**
 * @swagger
 * /api/orders/{id}/deliver:
 *   patch:
 *     summary: Confirmar recogida o entrega del conductor
 *     description: |
 *       Endpoint específico para conductores asignados. El sistema determina automáticamente si es recogida
 *       (`transit`) o entrega (`delivered`) según el estado actual de la orden.
 *       **Restricción**: Solo el conductor asignado o un admin pueden realizar esta acción.
 *     tags: [Orders]
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
 *               actual_bags: { type: integer }
 *               notes: { type: string }
 *               photos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url: { type: string }
 *     responses:
 *       200:
 *         description: Recogida/Entrega confirmada
 *       403:
 *         description: No es el conductor asignado
 *       400:
 *         description: Estado inválido para confirmar
 */
export const confirmDelivery = async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return sendError(res, 400, "Invalid order ID");

    const userId = Number(req.user!.userId);
    const order = await OrderService.confirmDriverAction(orderId, userId, req.user!.role, req.body);

    return sendSuccess(res, 200, "Driver action confirmed", order);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, error.message || "Driver confirmation failed");
  }
};
