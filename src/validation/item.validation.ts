import { z } from "zod";

export const createItemSchema = z.object({
  body: z.object({
    item_code: z.string().min(1),
    name: z.string().min(1),
    base_price: z.number().positive(),
    active: z.boolean().optional(),
  }),
});

export const updateItemSchema = z.object({
  body: z.object({
    item_code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    base_price: z.number().positive().optional(),
    active: z.boolean().optional(),
  }),
  params: z.object({ id: z.string() }),
});
