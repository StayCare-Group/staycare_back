import { z } from "zod";

export const createInvitationSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    role: z.enum(["admin", "driver", "staff", "operator"], {
      message: "Role must be admin, driver, staff, or operator",
    }),
  }),
});

export const registerViaInviteSchema = z.object({
  params: z.object({
    token: z.string().min(1, "Token is required"),
  }),
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().optional(),
    language: z.enum(["en", "es"]).optional(),
  }),
});

export type CreateInvitationInput = z.infer<
  typeof createInvitationSchema
>["body"];
export type RegisterViaInviteInput = z.infer<
  typeof registerViaInviteSchema
>["body"];
