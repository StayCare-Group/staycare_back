import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db/pool", () => ({
  default: { query: queryMock, execute: vi.fn() },
}));

import { ReportRepository } from "../../repositories/report.repository";
import { OrderStatus } from "../../types/orderStatus";

const start = new Date("2026-10-31T23:00:00.000Z");
const endExclusive = new Date("2026-11-30T23:00:00.000Z");

describe("ReportRepository.getDashboardStatusBreakdowns", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("groups orders and items by status in parallel and normalizes DB statuses", async () => {
    queryMock
      .mockResolvedValueOnce([
        [
          { status: "Pending", orderCount: 4 },
          { status: "Washing", orderCount: 3 },
          { status: "ReadyToDeliver", orderCount: 5 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { status: "Pending", itemCount: "80" },
          { status: "Washing", itemCount: "60" },
          { status: "ReadyToDeliver", itemCount: "100" },
        ],
      ]);

    const result = await ReportRepository.getDashboardStatusBreakdowns({ start, endExclusive });

    expect(result).toEqual({
      ordersByStatus: {
        [OrderStatus.PENDING]: 4,
        [OrderStatus.WASHING]: 3,
        [OrderStatus.READY_TO_DELIVERY]: 5,
      },
      itemsByStatus: {
        [OrderStatus.PENDING]: 80,
        [OrderStatus.WASHING]: 60,
        [OrderStatus.READY_TO_DELIVERY]: 100,
      },
    });
    expect(queryMock).toHaveBeenCalledTimes(2);

    const [ordersSql, ordersParams] = queryMock.mock.calls[0]!;
    expect(ordersSql).toContain("SELECT o.status AS status, COUNT(*) AS orderCount");
    expect(ordersSql).toContain("FROM orders o");
    expect(ordersSql).toContain("GROUP BY o.status");
    expect(ordersSql).not.toContain("order_items");
    expect(ordersSql).toContain("o.created_at >= ?");
    expect(ordersSql).toContain("o.created_at < ?");
    expect(ordersSql).toContain("o.status NOT IN (?)");
    expect(ordersSql).not.toContain("o.client_id");
    expect(ordersParams).toEqual([start, endExclusive, "Cancelled"]);

    const [itemsSql, itemsParams] = queryMock.mock.calls[1]!;
    expect(itemsSql).toContain("SELECT o.status AS status, COALESCE(SUM(oi.quantity), 0) AS itemCount");
    expect(itemsSql).toContain("INNER JOIN order_items oi ON oi.order_id = o.id");
    expect(itemsSql).toContain("GROUP BY o.status");
    expect(itemsParams).toEqual([start, endExclusive, "Cancelled"]);
  });

  it("adds the client filter when clientId is provided", async () => {
    queryMock
      .mockResolvedValueOnce([[{ status: "Delivered", orderCount: 3 }]])
      .mockResolvedValueOnce([[{ status: "Delivered", itemCount: 40 }]]);

    await ReportRepository.getDashboardStatusBreakdowns({
      start,
      endExclusive,
      clientId: "client-1",
    });

    for (const call of queryMock.mock.calls) {
      const [sql, params] = call;
      expect(sql).toContain("o.client_id = ?");
      expect(params).toEqual([start, endExclusive, "Cancelled", "client-1"]);
    }
  });

  it("returns empty maps when there are no orders in the range", async () => {
    queryMock.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    const result = await ReportRepository.getDashboardStatusBreakdowns({ start, endExclusive });

    expect(result).toEqual({ ordersByStatus: {}, itemsByStatus: {} });
  });
});
