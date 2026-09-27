import { z } from "zod";

export const createSubUserSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().nullable().optional(),
    language: z.enum(["en", "es"]).optional(),
    role_id: z.string().uuid("Invalid role ID format"),
  }),
});

export const updateSubUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    phone: z.string().nullable().optional(),
    language: z.enum(["en", "es"]).optional(),
    role_id: z.string().uuid().optional(),
    is_active: z.boolean().optional(),
  }),
});

export type CreateSubUserBody = z.infer<typeof createSubUserSchema>["body"];
export type UpdateSubUserBody = z.infer<typeof updateSubUserSchema>["body"];
