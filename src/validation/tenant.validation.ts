import { z } from "zod";

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Tenant name is required"),
  }),
});

export const createCustomRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Role name is required"),
    permissions: z
      .array(z.string().min(1, "Permission name/ID is required"))
      .min(1, "At least one permission is required"),
  }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>["body"];
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>["body"];
