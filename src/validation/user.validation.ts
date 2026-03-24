import { z } from "zod";

export const registerUserSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().optional(),
    language: z.enum(["en", "es"]).optional(),
    role: z.enum(["admin", "client", "driver", "staff"]).optional(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().optional(),
    language: z.enum(["en", "es"]).optional(),
    role: z.enum(["admin", "client", "driver", "staff"]).optional(),
    client: z.string().optional(),
  }),
});

export const loginUserSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(6, "New password must be at least 6 characters"),
  }),
});

export const updateMeSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    language: z.enum(["en", "es"]).optional(),
  }),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>["body"];
export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
export type LoginUserInput = z.infer<typeof loginUserSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type UpdateMeInput = z.infer<typeof updateMeSchema>["body"];