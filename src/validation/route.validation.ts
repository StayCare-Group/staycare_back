import { z } from "zod";
import { uuidIdSchema } from "./id.validation";

export const createRouteSchema = z.object({
  body: z.object({
    route_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
    driver_id: uuidIdSchema,
    area: z.string().min(1),
    order_ids: z.array(uuidIdSchema).optional(),
  }),
});

export const updateRouteSchema = z.object({
  body: z.object({
    route_date: z
      .string()
      .datetime({ offset: true })
      .or(z.string().min(1))
      .optional(),
    driver_id: uuidIdSchema.optional(),
    area: z.string().min(1).optional(),
    order_ids: z.array(uuidIdSchema).optional(),
    status: z.enum(["planned", "in_progress", "completed"]).optional(),
  }),
  params: z.object({ id: uuidIdSchema }),
});

export const updateRouteStatusSchema = z.object({
  body: z.object({
    status: z.enum(["planned", "in_progress", "completed"]),
  }),
  params: z.object({ id: uuidIdSchema }),
});
