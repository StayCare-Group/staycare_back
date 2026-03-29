import { z } from "zod";
import { propertySchema } from "./client.validation";

const clientProfileSchema = z.object({
  contact_person: z.string().min(1, "contact_person is required"),
  vat_number: z.string().min(1, "vat_number is required"),
  billing_address: z.string().min(1, "billing_address is required"),
  credits_terms_days: z.number().int().positive().max(3650).optional(),
  pricing_tier: z.enum(["standard", "premium", "enterprise"]).optional(),
});

const registerBodySchema = z
  .object({
    name: z.string().min(1, "name is required"),
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    phone: z.string().min(1, "phone is required"),
    language: z.enum(["en", "es"]),
    role: z.enum(["admin", "staff", "client", "driver"]).optional().default("client"),
    client_profile: clientProfileSchema.optional(),
    properties: z.array(propertySchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "client") {
      if (!data.client_profile) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "client_profile is required when role is client",
          path: ["client_profile"],
        });
      }
    } else {
      if (data.client_profile !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "client_profile must not be sent unless role is client",
          path: ["client_profile"],
        });
      }
      if (data.properties !== undefined && data.properties.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "properties are only allowed when role is client",
          path: ["properties"],
        });
      }
    }
  });

export const registerUserSchema = z.object({
  body: registerBodySchema,
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

export const updateUserByAdminSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    language: z.enum(["en", "es"]).optional(),
    password: z.string().min(6).optional(),
    is_active: z.boolean().optional(),
    client_profile: z
      .object({
        contact_person: z.string().min(1).optional(),
        vat_number: z.string().min(1).optional(),
        billing_address: z.string().min(1).optional(),
        credits_terms_days: z.number().int().positive().optional(),
        pricing_tier: z.enum(["standard", "premium", "enterprise"]).optional(),
      })
      .optional(),
  }),
});


export type RegisterRequestBody = z.infer<typeof registerBodySchema>;
export type RegisterClientBody = z.infer<typeof registerUserSchema>["body"];
export type LoginUserInput = z.infer<typeof loginUserSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type UpdateMeInput = z.infer<typeof updateMeSchema>["body"];
