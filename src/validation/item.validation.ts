import { z } from "zod";
import { ITEM_CATEGORIES } from "../types/itemCategory";

export const createItemSchema = z.object({
  body: z.object({
    item_code: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(ITEM_CATEGORIES).nullable().optional(),
    requires_ironing: z.boolean().optional(),
    base_price: z.number().positive(),
    is_active: z.boolean().optional(),
  }),
});

export const updateItemSchema = z.object({
  body: z.object({
    item_code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category: z.enum(ITEM_CATEGORIES).nullable().optional(),
    requires_ironing: z.boolean().optional(),
    base_price: z.number().positive().optional(),
    is_active: z.boolean().optional(),
  }),
  params: z.object({ id: z.string() }),
});

