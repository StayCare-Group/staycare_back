import { z } from "zod";

const propertySchema = z.object({
  property_name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  area: z.string().min(1),
  access_notes: z.string().optional().default(""),
});

export const createClientSchema = z.object({
  body: z.object({
    company_name: z.string().min(1),
    contact_person: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    vat_number: z.string().min(1),
    billing_address: z.string().min(1),
    credits_terms_days: z.number().int().positive().optional(),
    pricing_tier: z.enum(["standard", "premium", "enterprise"]).optional(),
    properties: z.array(propertySchema).optional(),
  }),
});

export const updateClientSchema = z.object({
  body: z.object({
    company_name: z.string().min(1).optional(),
    contact_person: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    vat_number: z.string().min(1).optional(),
    billing_address: z.string().min(1).optional(),
    credits_terms_days: z.number().int().positive().optional(),
    pricing_tier: z.enum(["standard", "premium", "enterprise"]).optional(),
  }),
  params: z.object({ id: z.string() }),
});

export const addPropertySchema = z.object({
  body: propertySchema,
  params: z.object({ id: z.string() }),
});

export const updatePropertySchema = z.object({
  body: z.object({
    property_name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    access_notes: z.string().optional(),
  }),
  params: z.object({ id: z.string(), propertyId: z.string() }),
});

/** POST /clients/self/properties — sin :id en la URL */
export const addSelfPropertySchema = z.object({
  body: propertySchema,
});

/** PUT /clients/self/properties/:propertyId */
export const updateSelfPropertySchema = z.object({
  body: z.object({
    property_name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    area: z.string().min(1).optional(),
    access_notes: z.string().optional(),
  }),
  params: z.object({ propertyId: z.string() }),
});
