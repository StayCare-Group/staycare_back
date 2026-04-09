import { z } from "zod";

export const uuidIdSchema = z.string().uuid("Invalid UUID format");
