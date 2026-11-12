import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("../../db/pool", () => ({
  default: { query: queryMock, execute: executeMock },
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
          { status: "Pending", itemCount: "80", qtyGood: "80", qtyBad: "0", qtyStained: "0" },
          { status: "Washing", itemCount: "60", qtyGood: "55", qtyBad: "2", qtyStained: "3" },
          { status: "ReadyToDeliver", itemCount: "100", qtyGood: "95", qtyBad: "1", qtyStained: "4" },
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
      conditionsByStatus: {
        [OrderStatus.PENDING]: { good: 80, bad: 0, stained: 0 },
        [OrderStatus.WASHING]: { good: 55, bad: 2, stained: 3 },
        [OrderStatus.READY_TO_DELIVERY]: { good: 95, bad: 1, stained: 4 },
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
    expect(itemsSql).toContain("COALESCE(SUM(oi.quantity), 0) AS itemCount");
    expect(itemsSql).toContain("COALESCE(SUM(oi.qty_good), 0) AS qtyGood");
    expect(itemsSql).toContain("COALESCE(SUM(oi.qty_bad), 0) AS qtyBad");
    expect(itemsSql).toContain("COALESCE(SUM(oi.qty_stained), 0) AS qtyStained");
    expect(itemsSql).toContain("INNER JOIN order_items oi ON oi.order_id = o.id");
    expect(itemsSql).toContain("GROUP BY o.status");
    expect(itemsParams).toEqual([start, endExclusive, "Cancelled"]);
  });

  it("adds the client filter when clientId is provided", async () => {
    queryMock
      .mockResolvedValueOnce([[{ status: "Delivered", orderCount: 3 }]])
      .mockResolvedValueOnce([[{ status: "Delivered", itemCount: 40, qtyGood: 38, qtyBad: 1, qtyStained: 1 }]]);

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

    expect(result).toEqual({ ordersByStatus: {}, itemsByStatus: {}, conditionsByStatus: {} });
  });
});

describe("ReportRepository.getDashboardOrdersByHour", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("groups non-cancelled orders by UTC hour and applies optional clientId filter", async () => {
    queryMock.mockResolvedValueOnce([
      [
        { hourUtc: "2026-10-31 23:00:00", orderCount: "3" },
        { hourUtc: "2026-11-01 10:00:00", orderCount: 5 },
      ],
    ]);

    const rows = await ReportRepository.getDashboardOrdersByHour({
      start,
      endExclusive,
      clientId: "client-99",
    });

    expect(rows).toEqual([
      { hourUtc: "2026-10-31 23:00:00", orderCount: 3 },
      { hourUtc: "2026-11-01 10:00:00", orderCount: 5 },
    ]);

    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toContain("DATE_FORMAT(o.created_at, '%Y-%m-%d %H:00:00') AS hourUtc");
    expect(sql).toContain("GROUP BY hourUtc");
    expect(sql).toContain("o.client_id = ?");
    expect(params).toEqual([start, endExclusive, "Cancelled", "client-99"]);
  });
});

describe("ReportRepository.getDashboardOverduePickups & getDashboardStalledOrders", () => {
  const thresholdDate = new Date("2026-11-09T21:00:00.000Z");

  beforeEach(() => {
    executeMock.mockReset();
  });

  it("queries overdue pickups in Pending/Assigned/Rescheduled with pickup_window_end < thresholdDate", async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          orderId: "ord-1",
          orderNumber: "ORD-001",
          clientId: "cli-1",
          clientName: "Client 1",
          status: "Pending",
          referenceDate: "2026-11-09T10:00:00.000Z",
        },
      ],
    ]);

    const rows = await ReportRepository.getDashboardOverduePickups(thresholdDate, "cli-1");

    expect(rows).toEqual([
      {
        orderId: "ord-1",
        orderNumber: "ORD-001",
        clientId: "cli-1",
        clientName: "Client 1",
        status: "Pending",
        referenceDate: new Date("2026-11-09T10:00:00.000Z"),
      },
    ]);

    const [sql, params] = executeMock.mock.calls[0]!;
    expect(sql).toContain("WHERE o.status IN ('Pending', 'Assigned', 'Rescheduled')");
    expect(sql).toContain("AND o.pickup_window_end < ?");
    expect(sql).toContain("AND o.client_id = ?");
    expect(params).toEqual([thresholdDate, "cli-1"]);
  });

  it("queries stalled orders in active processing/delivery statuses with updated_at < thresholdDate", async () => {
    executeMock.mockResolvedValueOnce([
      [
        {
          orderId: "ord-2",
          orderNumber: "ORD-002",
          clientId: "cli-2",
          clientName: null,
          status: "ReadyToDeliver",
          referenceDate: "2026-11-09T08:00:00.000Z",
        },
      ],
    ]);

    const rows = await ReportRepository.getDashboardStalledOrders(thresholdDate);

    expect(rows).toEqual([
      {
        orderId: "ord-2",
        orderNumber: "ORD-002",
        clientId: "cli-2",
        clientName: "Unknown",
        status: "ReadyToDeliver",
        referenceDate: new Date("2026-11-09T08:00:00.000Z"),
      },
    ]);

    const [sql, params] = executeMock.mock.calls[0]!;
    expect(sql).toContain(
      "WHERE o.status IN ('Transit', 'Arrived', 'Washing', 'Drying', 'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected')"
    );
    expect(sql).toContain("AND o.updated_at < ?");
    expect(sql).not.toContain("o.client_id = ?");
    expect(params).toEqual([thresholdDate]);
  });
});

