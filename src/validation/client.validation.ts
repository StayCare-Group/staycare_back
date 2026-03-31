import { z } from "zod";

export const propertySchema = z.object({
  property_name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  area: z.string().min(1),
  access_notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const updateClientSchema = z.object({
  body: z.object({
    company_name: z.string().min(1).optional(),
    contact_person: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional().nullable(),
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
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
  }),
  params: z.object({ id: z.string(), propertyId: z.string() }),
});


