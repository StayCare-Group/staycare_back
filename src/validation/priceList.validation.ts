import { z } from "zod";
import { uuidIdSchema } from "./id.validation";

export const priceListItemSchema = z.object({
  item_id: uuidIdSchema,
  price: z.number().min(0, "El precio no puede ser negativo"),
});

export const assignPriceListSchema = z.object({
  body: z.object({
    items: z.array(priceListItemSchema).min(1, "El arreglo de items no puede estar vacío"),
  }),
  params: z.object({ 
    id: uuidIdSchema
  }),
});
