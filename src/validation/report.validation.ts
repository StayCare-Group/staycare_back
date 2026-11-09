import { z } from "zod";
import { uuidIdSchema } from "./id.validation";
import { countCalendarDaysInclusive, isValidCalendarDate } from "../utils/businessDate";

/** Longest range a dashboard query may cover, to protect the database. */
export const MAX_DASHBOARD_RANGE_DAYS = 366;

const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Invalid date. Expected a real date formatted as YYYY-MM-DD");

/**
 * Query string of the admin dashboard endpoints.
 * `from` and `to` are inclusive business calendar days (Malta).
 */
export const dashboardFiltersQuerySchema = z
  .object({
    from: calendarDateSchema,
    to: calendarDateSchema,
    clientId: uuidIdSchema.optional(),
  })
  .superRefine((query, ctx) => {
    if (!isValidCalendarDate(query.from) || !isValidCalendarDate(query.to)) return;

    const days = countCalendarDaysInclusive(query.from, query.to);
    if (days < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "`to` must be the same day as `from` or later",
      });
    } else if (days > MAX_DASHBOARD_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Date range cannot exceed ${MAX_DASHBOARD_RANGE_DAYS} days`,
      });
    }
  });

export type DashboardFiltersQuery = z.infer<typeof dashboardFiltersQuerySchema>;

