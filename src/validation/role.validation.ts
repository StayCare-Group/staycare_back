import { z } from "zod";

export const createCustomRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Role name is required"),
    permissions: z
      .array(z.string().min(1, "Permission name or ID is required"))
      .min(1, "At least one permission is required"),
  }),
});

export const updateCustomRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    permissions: z
      .array(z.string().min(1))
      .min(1)
      .optional(),
  }),
});

export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>["body"];
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>["body"];
