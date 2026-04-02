import { z } from "zod";

export const createInvoiceSchema = z.object({
  body: z.object({
    client: z.coerce.number().int().positive(),
    orders: z.array(z.coerce.number().int().positive()).min(1),
    due_date: z.string().min(1, "due_date is required"),
    line_items: z
      .array(
        z.object({
          description: z.string().min(1),
          quantity: z.coerce.number().int().positive(),
          unit_price: z.coerce.number().positive(),
          total_price: z.coerce.number().positive(),
        }),
      )
      .min(1),
    subtotal: z.coerce.number().nonnegative(),
    vat_percentage: z.coerce.number().nonnegative().default(18),
    vat_amount: z.coerce.number().nonnegative(),
    total: z.coerce.number().nonnegative(),
  }),
});

export const recordPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
    method: z.enum(["cash", "bank_transfer", "card"]),
    transaction_reference: z.string().min(1),
  }),
  params: z.object({ id: z.string() }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>["body"];
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>["body"];
