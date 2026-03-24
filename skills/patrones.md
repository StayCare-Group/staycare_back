# Patrones de código por capa — StayCare Backend

## Regla de oro
- **Repository**: solo SQL. Sin lógica de negocio. Sin if/else de negocio.
- **Service**: solo lógica de negocio. Sin SQL. Sin req/res.
- **Controller**: solo orquesta. Llama al servicio y responde. Sin SQL. Sin lógica de negocio.
- **Schema**: solo validación Zod. Un schema por operación.
- **Routes**: solo define verbos HTTP + middlewares. Sin lógica.

---

## 1. Repository — [modulo].repository.ts

Toda query SQL vive aquí. Siempre usa parámetros preparados (?).
Nunca concatenes strings para construir queries.

```typescript
// src/modules/orders/order.repository.ts
import { pool } from '../../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export const findOrderById = async (id: number) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.*, u.name AS driver_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.deliver_id
     WHERE o.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
};

export const insertOrder = async (data: {
  order_number: string;
  client_id: number;
  service_type: string;
  pickup_date: string;
  pickup_window_start: string;
  pickup_window_end: string;
  snapshot_subtotal: number;
  snapshot_vat_percentage: number;
  snapshot_vat_amount: number;
  snapshot_total: number;
}) => {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO orders
       (order_number, client_id, service_type, pickup_date,
        pickup_window_start, pickup_window_end,
        snapshot_subtotal, snapshot_vat_percentage,
        snapshot_vat_amount, snapshot_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(data)
  );
  return result.insertId;
};

export const updateOrderStatus = async (
  id: number,
  status: string
) => {
  await pool.query(
    'UPDATE orders SET status = ? WHERE id = ?',
    [status, id]
  );
};
```

---

## 2. Service — [modulo].service.ts

Lógica de negocio pura. Llama al repository. Lanza AppError si algo falla.
No importa pool ni mysql2 aquí.

```typescript
// src/modules/orders/order.service.ts
import { AppError } from '../../shared/utils/AppError';
import * as orderRepo from './order.repository';

export const getOrderById = async (id: number, requestingUser: {
  userId: string;
  role: string;
}) => {
  const order = await orderRepo.findOrderById(id);

  if (!order) throw new AppError('Order not found', 404);

  // Lógica de acceso por rol
  if (requestingUser.role === 'client') {
    const clientId = Number(requestingUser.userId);
    if (order.client_id !== clientId) {
      throw new AppError('Forbidden', 403);
    }
  }

  return order;
};

export const createOrder = async (data: CreateOrderDTO) => {
  const orderNumber = generateOrderNumber(); // lógica de negocio aquí
  const orderId = await orderRepo.insertOrder({
    order_number: orderNumber,
    ...data,
  });
  return orderRepo.findOrderById(orderId);
};
```

---

## 3. Controller — [modulo].controller.ts

Solo orquesta. Lee de req, llama al service, responde con sendSuccess/sendError.
No hay SQL aquí. No hay lógica de negocio aquí.

```typescript
// src/modules/orders/order.controller.ts
import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../shared/utils/response';
import * as orderService from './order.service';

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(
      Number(req.params.id),
      req.user!
    );
    return sendSuccess(res, 200, 'Order retrieved', { order });
  } catch (error) {
    if (error instanceof AppError) throw error; // deja que errorHandler lo capture
    return sendError(res, 400, 'Failed to retrieve order');
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const order = await orderService.createOrder(req.body);
    return sendSuccess(res, 201, 'Order created', { order });
  } catch (error) {
    throw error;
  }
};
```

---

## 4. Schema — [modulo].schema.ts

Un schema Zod por operación. Siempre valida body y params por separado.

```typescript
// src/modules/orders/order.schema.ts
import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    client_id: z.number().int().positive().optional(),
    service_type: z.enum(['standard', 'express']),
    pickup_date: z.string().min(1),
    pickup_window: z.object({
      start_time: z.string().min(1),
      end_time: z.string().min(1),
    }),
    estimated_bags: z.number().int().positive().optional(),
    special_notes: z.string().optional(),
    items: z.array(z.object({
      item_code: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
      unit_price: z.number().positive(),
      total_price: z.number().positive(),
    })).optional(),
  }),
});

export const updateStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum([
      'Pending','Assigned','Transit','Arrived','Washing',
      'Drying','Ironing','QualityCheck','ReadyToDeliver',
      'Collected','Delivered','Invoiced','Completed'
    ]),
  }),
});
```

---

## 5. Routes — [modulo].routes.ts

Solo define verbos HTTP y encadena middlewares.
El orden siempre es: authenticate → authorize → validate → controller.

```typescript
// src/modules/orders/order.routes.ts
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate';
import { authorize } from '../../shared/middleware/authorize';
import { validate } from '../../shared/middleware/validate';
import { createOrderSchema, updateStatusSchema } from './order.schema';
import { createOrder, getOrderById, updateOrderStatus } from './order.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize('admin', 'staff', 'client'),
  validate(createOrderSchema),
  createOrder
);

router.get('/:id', getOrderById);

router.patch(
  '/:id/status',
  authorize('admin', 'staff'),
  validate(updateStatusSchema),
  updateOrderStatus
);

export default router;
```

---

## 6. Manejo de errores

Lanza AppError desde el service para errores de negocio.
El errorHandler en app.ts los captura todos automáticamente.

```typescript
import { AppError } from '../../shared/utils/AppError';

// En el service:
if (!order) throw new AppError('Order not found', 404);
if (order.status !== 'Pending') throw new AppError('Order cannot be deleted', 409);
```

Nunca uses sendError para errores que el service debe controlar.
sendError es solo para el controlador cuando el error no es de AppError.

---

## 7. Transacciones SQL

Cuando una operación toca múltiples tablas (ej: crear pedido + insertar items + insertar status_history),
usa una transacción para garantizar atomicidad.

```typescript
// En el repository:
export const createOrderWithItems = async (orderData: any, items: any[]) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query<ResultSetHeader>(
      'INSERT INTO orders (...) VALUES (...)', [...]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, ...) VALUES (?, ...)',
        [orderId, ...]
      );
    }

    await conn.query(
      'INSERT INTO order_status_history (order_id, status, is_system_action) VALUES (?, ?, ?)',
      [orderId, 'Pending', true]
    );

    await conn.commit();
    return orderId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
```
