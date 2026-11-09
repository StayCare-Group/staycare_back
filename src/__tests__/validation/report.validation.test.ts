import { describe, it, expect } from "vitest";
import {
  dashboardFiltersQuerySchema,
  MAX_DASHBOARD_RANGE_DAYS,
} from "../../validation/report.validation";

const CLIENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("dashboardFiltersQuerySchema", () => {
  it("accepts a valid range without clientId", () => {
    const result = dashboardFiltersQuerySchema.safeParse({ from: "2026-11-01", to: "2026-11-30" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid range with a UUID clientId", () => {
    const result = dashboardFiltersQuerySchema.safeParse({
      from: "2026-11-01",
      to: "2026-11-01",
      clientId: CLIENT_ID,
    });
    expect(result.success).toBe(true);
  });

  it("requires from and to", () => {
    expect(dashboardFiltersQuerySchema.safeParse({ from: "2026-11-01" }).success).toBe(false);
    expect(dashboardFiltersQuerySchema.safeParse({ to: "2026-11-01" }).success).toBe(false);
    expect(dashboardFiltersQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects malformed and impossible dates", () => {
    expect(dashboardFiltersQuerySchema.safeParse({ from: "01-11-2026", to: "2026-11-30" }).success).toBe(false);
    expect(dashboardFiltersQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
    expect(dashboardFiltersQuerySchema.safeParse({ from: "2026-11-01T00:00:00Z", to: "2026-11-30" }).success).toBe(false);
  });

  it("rejects from after to", () => {
    const result = dashboardFiltersQuerySchema.safeParse({ from: "2026-11-02", to: "2026-11-01" });
    expect(result.success).toBe(false);
  });

  it("accepts the maximum range and rejects one day more", () => {
    // 2026 is not a leap year: 2026-01-01 .. 2027-01-01 is 366 days inclusive.
    expect(MAX_DASHBOARD_RANGE_DAYS).toBe(366);
    expect(dashboardFiltersQuerySchema.safeParse({ from: "2026-01-01", to: "2027-01-01" }).success).toBe(true);
    expect(dashboardFiltersQuerySchema.safeParse({ from: "2026-01-01", to: "2027-01-02" }).success).toBe(false);
  });

  it("rejects a clientId that is not a UUID", () => {
    const result = dashboardFiltersQuerySchema.safeParse({
      from: "2026-11-01",
      to: "2026-11-30",
      clientId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects repeated query params (arrays)", () => {
    const result = dashboardFiltersQuerySchema.safeParse({
      from: ["2026-11-01", "2026-11-02"],
      to: "2026-11-30",
    });
    expect(result.success).toBe(false);
  });
});

