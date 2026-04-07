import { z } from "zod";

export const createInvitationSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email"),
    role: z.enum(["admin", "driver", "staff", "operator", "client"], {
      message: "Role must be admin, driver, staff, operator, or client",
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
    client_profile: z.object({
      contact_person: z.string().min(2),
      vat_number: z.string().min(2),
      billing_address: z.string().min(5),
    }).optional(),
  }),
});

export type CreateInvitationInput = z.infer<
  typeof createInvitationSchema
>["body"];
export type RegisterViaInviteInput = z.infer<
  typeof registerViaInviteSchema
>["body"];
