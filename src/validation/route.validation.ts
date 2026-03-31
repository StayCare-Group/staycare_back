import { z } from "zod";

export const createRouteSchema = z.object({
  body: z.object({
    route_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
    driver_id: z.number().int().positive(),
    area: z.string().min(1),
    order_ids: z.array(z.number().int().positive()).optional(),
  }),
});

export const updateRouteSchema = z.object({
  body: z.object({
    route_date: z
      .string()
      .datetime({ offset: true })
      .or(z.string().min(1))
      .optional(),
    driver_id: z.number().int().positive().optional(),
    area: z.string().min(1).optional(),
    order_ids: z.array(z.number().int().positive()).optional(),
    status: z.enum(["planned", "in_progress", "completed"]).optional(),
  }),
  params: z.object({ id: z.string() }),
});

export const updateRouteStatusSchema = z.object({
  body: z.object({
    status: z.enum(["planned", "in_progress", "completed"]),
  }),
  params: z.object({ id: z.string() }),
});
