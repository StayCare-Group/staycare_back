import { describe, it, expect } from "vitest";
import {
  BUSINESS_TIMEZONE,
  countCalendarDaysInclusive,
  formatBusinessDate,
  getBusinessDateRangeUtc,
  isValidCalendarDate,
  listBusinessCalendarDays,
  listBusinessCalendarMonths,
} from "../../utils/businessDate";

/**
 * Malta: UTC+1 in winter (CET), UTC+2 in summer (CEST).
 * 2026 DST: starts Sunday 29 March, ends Sunday 25 October.
 */
describe("businessDate", () => {
  it("uses the Malta timezone", () => {
    expect(BUSINESS_TIMEZONE).toBe("Europe/Malta");
  });

  describe("getBusinessDateRangeUtc", () => {
    it("converts a winter day (UTC+1) to its UTC bounds", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-11-01", "2026-11-01");
      expect(start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
      expect(endExclusive.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    });

    it("converts a summer day (UTC+2) to its UTC bounds", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-07-15", "2026-07-15");
      expect(start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
      expect(endExclusive.toISOString()).toBe("2026-07-15T22:00:00.000Z");
    });

    it("includes the whole last day of the range", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-11-01", "2026-11-07");
      expect(start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
      expect(endExclusive.toISOString()).toBe("2026-11-07T23:00:00.000Z");
    });

    it("an order created at 00:30 Malta belongs to that Malta day, not the previous one", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-11-05", "2026-11-05");
      const createdAtUtc = new Date("2026-11-04T23:30:00.000Z"); // 00:30 on Nov 5 in Malta
      expect(createdAtUtc >= start && createdAtUtc < endExclusive).toBe(true);
    });

    it("handles the spring DST change (23-hour day)", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-03-29", "2026-03-29");
      expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z");
      expect(endExclusive.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    });

    it("handles the autumn DST change (25-hour day)", () => {
      const { start, endExclusive } = getBusinessDateRangeUtc("2026-10-25", "2026-10-25");
      expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
      expect(endExclusive.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    });

    it("handles month and year rollovers", () => {
      const { endExclusive } = getBusinessDateRangeUtc("2026-12-01", "2026-12-31");
      expect(endExclusive.toISOString()).toBe("2026-12-31T23:00:00.000Z");

      const leap = getBusinessDateRangeUtc("2028-02-29", "2028-02-29");
      expect(leap.start.toISOString()).toBe("2028-02-28T23:00:00.000Z");
      expect(leap.endExclusive.toISOString()).toBe("2028-02-29T23:00:00.000Z");
    });

    it("throws a 400 error for an invalid date", () => {
      expect(() => getBusinessDateRangeUtc("2026-02-30", "2026-03-01")).toThrow(/Invalid date/);
    });
  });

  describe("isValidCalendarDate", () => {
    it("accepts real dates and rejects malformed or impossible ones", () => {
      expect(isValidCalendarDate("2026-11-07")).toBe(true);
      expect(isValidCalendarDate("2028-02-29")).toBe(true);
      expect(isValidCalendarDate("2026-02-29")).toBe(false);
      expect(isValidCalendarDate("2026-13-01")).toBe(false);
      expect(isValidCalendarDate("2026-1-1")).toBe(false);
      expect(isValidCalendarDate("2026-11-07T00:00:00Z")).toBe(false);
      expect(isValidCalendarDate("")).toBe(false);
    });
  });

  describe("countCalendarDaysInclusive", () => {
    it("counts days inclusively", () => {
      expect(countCalendarDaysInclusive("2026-11-01", "2026-11-01")).toBe(1);
      expect(countCalendarDaysInclusive("2026-11-01", "2026-11-30")).toBe(30);
      expect(countCalendarDaysInclusive("2026-03-28", "2026-03-30")).toBe(3);
      expect(countCalendarDaysInclusive("2026-11-02", "2026-11-01")).toBe(0);
    });
  });

  describe("formatBusinessDate", () => {
    it("maps UTC hour strings around Malta midnight in winter (UTC+1) and summer (UTC+2)", () => {
      // Winter (UTC+1): 22:00 UTC is still 23:00 in Malta, 23:00 UTC is 00:00 next day in Malta
      expect(formatBusinessDate("2026-11-01 22:00:00")).toBe("2026-11-01");
      expect(formatBusinessDate("2026-11-01 23:00:00")).toBe("2026-11-02");

      // Summer (UTC+2): 21:00 UTC is 23:00 in Malta, 22:00 UTC is 00:00 next day in Malta
      expect(formatBusinessDate("2026-07-15 21:00:00")).toBe("2026-07-15");
      expect(formatBusinessDate("2026-07-15 22:00:00")).toBe("2026-07-16");
    });
  });

  describe("listBusinessCalendarDays & listBusinessCalendarMonths", () => {
    it("lists inclusive calendar days across month boundaries", () => {
      expect(listBusinessCalendarDays("2026-01-30", "2026-02-02")).toEqual([
        "2026-01-30",
        "2026-01-31",
        "2026-02-01",
        "2026-02-02",
      ]);
    });

    it("lists inclusive calendar months across year boundaries", () => {
      expect(listBusinessCalendarMonths("2025-11-15", "2026-02-10")).toEqual([
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
      ]);
    });
  });
});

