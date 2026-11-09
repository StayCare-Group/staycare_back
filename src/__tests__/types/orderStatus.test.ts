import { describe, it, expect } from "vitest";
import {
  OrderStatus,
  REPORT_EXCLUDED_ORDER_STATUSES,
  PENDING_ITEM_ORDER_STATUSES,
  PROCESSING_ITEM_ORDER_STATUSES,
  DELIVERED_ITEM_ORDER_STATUSES,
} from "../../types/orderStatus";

describe("OrderStatus KPI item status groups", () => {
  it("partitions every non-excluded OrderStatus into exactly one KPI item group", () => {
    const excluded = new Set<OrderStatus>(REPORT_EXCLUDED_ORDER_STATUSES);
    const groups = [
      PENDING_ITEM_ORDER_STATUSES,
      PROCESSING_ITEM_ORDER_STATUSES,
      DELIVERED_ITEM_ORDER_STATUSES,
    ];

    for (const status of Object.values(OrderStatus)) {
      const matchingGroups = groups.filter((group) => group.has(status));

      if (excluded.has(status)) {
        expect(
          matchingGroups.length,
          `Excluded status "${status}" must not belong to any KPI item group`
        ).toBe(0);
      } else {
        expect(
          matchingGroups.length,
          `Active status "${status}" must belong to exactly 1 KPI item group`
        ).toBe(1);
      }
    }
  });
});

