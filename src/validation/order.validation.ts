import { z } from "zod";
import { OrderStatus } from "../types/orderStatus";
import { uuidIdSchema } from "./id.validation";

const orderItemSchema = z.object({
  item_id: uuidIdSchema,
  quantity: z.number().int().positive(),
  // Optional snapshots if sent, but will be overwritten by backend
  item_code: z.string().optional(),
  name: z.string().optional(),
  unit_price: z.number().optional(),
  total_price: z.number().optional(),
  // Condition breakdown — used by receiveInPlant; passed through if present
  qty_good: z.number().int().min(0).optional(),
  qty_bad: z.number().int().min(0).optional(),
  qty_stained: z.number().int().min(0).optional(),
});

export const createOrderSchema = z.object({
  body: z.object({
    client_id: uuidIdSchema.optional(), // For admin/staff
    property_id: uuidIdSchema.optional(),
    service_type: z.enum(["standard", "express"]),
    pickup_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
    pickup_window: z.object({
      start_time: z.string().datetime({ offset: true }).or(z.string().min(1)),
      end_time: z.string().datetime({ offset: true }).or(z.string().min(1)),
    }),
    estimated_bags: z.number().int().positive().optional(),
    special_notes: z.string().optional(),
    items: z.array(orderItemSchema).optional(), // Los ítems se pueden omitir y confirmar al recibir en planta

  }),
});

export const updateOrderSchema = z.object({
  body: z.object({
    service_type: z.enum(["standard", "express"]).optional(),
    pickup_date: z
      .string()
      .datetime({ offset: true })
      .or(z.string().min(1))
      .optional(),
    pickup_window: z
      .object({
        start_time: z
          .string()
          .datetime({ offset: true })
          .or(z.string().min(1)),
        end_time: z
          .string()
          .datetime({ offset: true })
          .or(z.string().min(1)),
      })
      .optional(),
    estimated_bags: z.number().int().positive().optional(),
    special_notes: z.string().optional(),
    items: z.array(orderItemSchema).optional(),
  }),
  params: z.object({ id: uuidIdSchema }),
});

/**
 * Schema unificado para PATCH /api/orders/:id/status
 *
 * Campos extra opcionales dependiendo del status:
 *  - transit   → actual_bags (req), photos?, notes?
 *  - arrived   → internal_notes?
 *  - delivered → photos?, notes?
 *  - (resto)   → solo note?
 */
export const advanceStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(OrderStatus),
    // Pickup (transit)
    actual_bags: z.number().int().positive().optional(),
    // Photos (transit / delivered)
    photos: z
      .array(z.object({ url: z.string().url() }))
      .optional(),
    // Notes generales / driver pickup
    notes: z.string().optional(),
    // Staff — recepción en facility
    internal_notes: z.string().optional(),
    staff_confirmed_bags: z.number().int().positive().optional(),
    items: z.array(orderItemSchema).optional(),
    // Historia genérica
    note: z.string().optional(),
  }),
  params: z.object({ id: uuidIdSchema }),
});

export const rescheduleOrderSchema = z.object({
  body: z.object({
    pickup_date: z.string().min(1),
    pickup_window: z.object({
      start_time: z.string().min(1),
      end_time: z.string().min(1),
    }),
  }),
  params: z.object({ id: uuidIdSchema }),
});

export const confirmDriverActionSchema = z.object({
  body: z.object({
    actual_bags: z.number().int().positive().optional(),
    photos: z
      .array(z.object({ url: z.string().url() }))
      .optional(),
    notes: z.string().optional(),
  }),
  params: z.object({ id: uuidIdSchema }),
});
