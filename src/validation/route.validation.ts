import { z } from "zod";

export const createRouteSchema = z.object({
  body: z.object({
    route_date: z.string().datetime({ offset: true }).or(z.string().min(1)),
    driver: z.string().min(1),
    area: z.string().min(1),
    orders: z.array(z.string().min(1)).optional(),
  }),
});

export const updateRouteSchema = z.object({
  body: z.object({
    route_date: z
      .string()
      .datetime({ offset: true })
      .or(z.string().min(1))
      .optional(),
    driver: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    orders: z.array(z.string().min(1)).optional(),
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
