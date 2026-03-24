import { z } from "zod";

const orderItemSchema = z.object({
  item_code: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  total_price: z.number().positive(),
});

export const createOrderSchema = z.object({
  body: z.object({
    // For admin/staff, client must be provided.
    // For clients, the controller will override this field from the authenticated user.
    client: z.string().min(1).optional(),
    property: z.string().optional(),
    service_type: z.enum(["standard", "express"]),
    pickup_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
    pickup_window: z.object({
      start_time: z.string().datetime({ offset: true }).or(z.string().min(1)),
      end_time: z.string().datetime({ offset: true }).or(z.string().min(1)),
    }),
    estimated_bags: z.number().int().positive().optional(),
    special_notes: z.string().optional(),
    items: z.array(orderItemSchema).optional(),
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
    pricing_snapshot: z
      .object({
        subtotal: z.number(),
        vat_percentage: z.number(),
        vat_amount: z.number(),
        total: z.number(),
      })
      .optional(),
  }),
  params: z.object({ id: z.string() }),
});

const validStatuses = [
  "Pending",
  "Assigned",
  "Transit",
  "Arrived",
  "Washing",
  "Drying",
  "Ironing",
  "QualityCheck",
  "ReadyToDeliver",
  "Collected",
  "Delivered",
  "Invoiced",
  "Completed",
] as const;

export const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum(validStatuses),
  }),
  params: z.object({ id: z.string() }),
});

export const pickupConfirmSchema = z.object({
  body: z.object({
    actual_bags: z.number().int().positive(),
    photos: z
      .array(
        z.object({
          photo_url: z.string().url(),
          type: z.enum(["before", "after"]),
        }),
      )
      .optional(),
    items: z.array(orderItemSchema).optional(),
    notes: z.string().optional(),
  }),
  params: z.object({ id: z.string() }),
});

export const facilityReceiveSchema = z.object({
  body: z.object({
    items: z.array(orderItemSchema).optional(),
    internal_notes: z.string().optional(),
  }),
  params: z.object({ id: z.string() }),
});

export const deliveryConfirmSchema = z.object({
  body: z.object({
    photos: z
      .array(
        z.object({
          photo_url: z.string().url(),
          type: z.enum(["before", "after"]),
        }),
      )
      .optional(),
    confirmation_method: z.enum(["signature", "pin", "photo"]).optional(),
    notes: z.string().optional(),
  }),
  params: z.object({ id: z.string() }),
});

export const rescheduleOrderSchema = z.object({
  body: z.object({
    pickup_date: z.string().min(1),
    pickup_window: z.object({
      start_time: z.string().min(1),
      end_time: z.string().min(1),
    }),
  }),
  params: z.object({ id: z.string() }),
});
