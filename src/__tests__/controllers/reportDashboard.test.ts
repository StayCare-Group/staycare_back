import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const {
  getStatusBreakdownsRepoMock,
  getOrdersByHourRepoMock,
  getOverduePickupsRepoMock,
  getStalledOrdersRepoMock,
  getInvoicedTotalRepoMock,
} = vi.hoisted(() => ({
  getStatusBreakdownsRepoMock: vi.fn(),
  getOrdersByHourRepoMock: vi.fn(),
  getOverduePickupsRepoMock: vi.fn(),
  getStalledOrdersRepoMock: vi.fn(),
  getInvoicedTotalRepoMock: vi.fn(),
}));

vi.mock("../../repositories/report.repository", () => ({
  ReportRepository: {
    getDashboardStatusBreakdowns: getStatusBreakdownsRepoMock,
    getDashboardOrdersByHour: getOrdersByHourRepoMock,
    getDashboardOverduePickups: getOverduePickupsRepoMock,
    getDashboardStalledOrders: getStalledOrdersRepoMock,
    getDashboardInvoicedTotal: getInvoicedTotalRepoMock,
  },
}));

import {
  getDashboardOverview,
  getDashboardDailyOrders,
  getDashboardAlerts,
  getDashboardComparison,
} from "../../controllers/report.controller";
import { OrderStatus } from "../../types/orderStatus";

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockImplementation(() => res);
  res.json = vi.fn().mockImplementation((data: unknown) => {
    (res as Response & { body: unknown }).body = data;
    return res;
  });
  return res as Response & { body: any };
}

describe("getDashboardOverview controller & service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatusBreakdownsRepoMock.mockReset();
  });

  it("returns 400 when the filters are invalid and does not hit the repository", async () => {
    const req = { query: { from: "2026-11-30", to: "2026-11-01" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
    expect(getStatusBreakdownsRepoMock).not.toHaveBeenCalled();
  });

  it("converts the Malta range to UTC and aggregates KPIs, itemsInProcess, ordersToPickup/Deliver and itemConditions", async () => {
    getStatusBreakdownsRepoMock.mockResolvedValue({
      ordersByStatus: {
        [OrderStatus.PENDING]: 2,
        [OrderStatus.ARRIVED]: 1,
        [OrderStatus.WASHING]: 3,
        [OrderStatus.IRONING]: 1,
        [OrderStatus.READY_TO_DELIVERY]: 2,
        [OrderStatus.DELIVERED]: 4,
      },
      itemsByStatus: {
        [OrderStatus.PENDING]: 30,
        [OrderStatus.ARRIVED]: 20,
        [OrderStatus.WASHING]: 45,
        [OrderStatus.IRONING]: 15,
        [OrderStatus.READY_TO_DELIVERY]: 25,
        [OrderStatus.DELIVERED]: 65,
      },
      conditionsByStatus: {
        [OrderStatus.PENDING]: { good: 30, bad: 0, stained: 0 }, // Excluded (< arrived)
        [OrderStatus.ARRIVED]: { good: 18, bad: 1, stained: 1 },
        [OrderStatus.WASHING]: { good: 40, bad: 2, stained: 3 },
        [OrderStatus.IRONING]: { good: 14, bad: 0, stained: 1 },
        [OrderStatus.READY_TO_DELIVERY]: { good: 24, bad: 1, stained: 0 },
        [OrderStatus.DELIVERED]: { good: 60, bad: 2, stained: 3 },
      },
    });
    const req = { query: { from: "2026-11-01", to: "2026-11-07" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        ordersReceived: 13,
        itemsTotal: 200,
        itemsPending: 50,
        itemsProcessed: 60,
        itemsDelivered: 90,
        ordersToPickup: 2,
        ordersToDeliver: 2,
        itemsInProcess: {
          washing: 45,
          drying: 0,
          ironing: 15,
          qualityCheck: 0,
        },
        itemConditions: {
          good: 156,
          bad: 6,
          stained: 8,
          total: 170,
        },
      },
    });

    const filters = getStatusBreakdownsRepoMock.mock.calls[0]![0];
    expect(filters.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(filters.endExclusive.toISOString()).toBe("2026-11-07T23:00:00.000Z");
    expect(filters.clientId).toBeUndefined();
  });

  it("forwards clientId to the repository", async () => {
    getStatusBreakdownsRepoMock.mockResolvedValue({
      ordersByStatus: { [OrderStatus.DELIVERED]: 1 },
      itemsByStatus: { [OrderStatus.DELIVERED]: 2 },
    });
    const clientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const req = { query: { from: "2026-11-01", to: "2026-11-01", clientId } } as unknown as Request;

    await getDashboardOverview(req, mockResponse());

    expect(getStatusBreakdownsRepoMock.mock.calls[0]![0].clientId).toBe(clientId);
  });

  it("returns 500 when the repository fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => { });
    getStatusBreakdownsRepoMock.mockRejectedValue(new Error("db down"));
    const req = { query: { from: "2026-11-01", to: "2026-11-01" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("getDashboardDailyOrders controller & service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrdersByHourRepoMock.mockReset();
  });

  it("returns day granularity for ranges <= 31 days, buckets UTC hours into Malta days and fills missing days with 0", async () => {
    // 2026-10-31 23:00 UTC is 2026-11-01 00:00 in Malta (CET, UTC+1)
    // 2026-11-01 22:00 UTC is 2026-11-01 23:00 in Malta
    // 2026-11-01 23:00 UTC is 2026-11-02 00:00 in Malta
    getOrdersByHourRepoMock.mockResolvedValue([
      { hourUtc: "2026-10-31 23:00:00", orderCount: 2 },
      { hourUtc: "2026-11-01 22:00:00", orderCount: 4 },
      { hourUtc: "2026-11-01 23:00:00", orderCount: 5 },
    ]);

    const req = { query: { from: "2026-11-01", to: "2026-11-03" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardDailyOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        granularity: "day",
        points: [
          { date: "2026-11-01", orders: 6 },
          { date: "2026-11-02", orders: 5 },
          { date: "2026-11-03", orders: 0 },
        ],
      },
    });
  });

  it("switches to month granularity for ranges > 31 days (e.g. 32 days or full year)", async () => {
    getOrdersByHourRepoMock.mockResolvedValue([
      { hourUtc: "2026-01-15 10:00:00", orderCount: 10 },
      { hourUtc: "2026-03-20 12:00:00", orderCount: 7 },
    ]);

    const req = { query: { from: "2026-01-01", to: "2026-03-31" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardDailyOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data).toEqual({
      granularity: "month",
      points: [
        { date: "2026-01", orders: 10 },
        { date: "2026-02", orders: 0 },
        { date: "2026-03", orders: 7 },
      ],
    });
  });

  it("returns 400 when filters are invalid", async () => {
    const req = { query: { from: "2026-11-10", to: "2026-11-01" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardDailyOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getOrdersByHourRepoMock).not.toHaveBeenCalled();
  });
});

describe("getDashboardAlerts controller & service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOverduePickupsRepoMock.mockReset();
    getStalledOrdersRepoMock.mockReset();
  });

  it("returns 400 when clientId is not a valid UUID", async () => {
    const req = { query: { clientId: "invalid-id" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardAlerts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
    expect(getOverduePickupsRepoMock).not.toHaveBeenCalled();
  });

  it("returns overdue pickups and stalled orders with calculated delayed hours", async () => {
    const now = new Date("2026-11-10T21:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const pickupDate = new Date("2026-11-09T15:00:00Z"); // 30 hours ago
    const stalledDate = new Date("2026-11-09T19:00:00Z"); // 26 hours ago

    getOverduePickupsRepoMock.mockResolvedValue([
      {
        orderId: "ord-1",
        orderNumber: "ORD-001",
        clientId: "client-1",
        clientName: "Client A",
        status: "Pending",
        referenceDate: pickupDate,
      },
    ]);

    getStalledOrdersRepoMock.mockResolvedValue([
      {
        orderId: "ord-2",
        orderNumber: "ORD-002",
        clientId: "client-2",
        clientName: "Client B",
        status: "ReadyToDeliver",
        referenceDate: stalledDate,
      },
    ]);

    const req = { query: {} } as unknown as Request;
    const res = mockResponse();

    await getDashboardAlerts(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.thresholdHours).toBe(24);
    expect(res.body.data.totalAlerts).toBe(2);

    expect(res.body.data.overduePickups).toEqual([
      {
        orderId: "ord-1",
        orderNumber: "ORD-001",
        clientId: "client-1",
        clientName: "Client A",
        status: OrderStatus.PENDING,
        hoursDelayed: 30,
        referenceDate: pickupDate.toISOString(),
      },
    ]);

    expect(res.body.data.stalledOrders).toEqual([
      {
        orderId: "ord-2",
        orderNumber: "ORD-002",
        clientId: "client-2",
        clientName: "Client B",
        status: OrderStatus.READY_TO_DELIVERY,
        hoursDelayed: 26,
        referenceDate: stalledDate.toISOString(),
      },
    ]);

    vi.useRealTimers();
  });

  it("passes clientId to both repository calls when provided", async () => {
    const clientId = "11111111-1111-4111-8111-111111111111";
    getOverduePickupsRepoMock.mockResolvedValue([]);
    getStalledOrdersRepoMock.mockResolvedValue([]);

    const req = { query: { clientId } } as unknown as Request;
    const res = mockResponse();

    await getDashboardAlerts(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getOverduePickupsRepoMock).toHaveBeenCalledWith(expect.any(Date), clientId);
    expect(getStalledOrdersRepoMock).toHaveBeenCalledWith(expect.any(Date), clientId);
    expect(res.body.data.totalAlerts).toBe(0);
  });
});

describe("getDashboardComparison controller & service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStatusBreakdownsRepoMock.mockReset();
    getInvoicedTotalRepoMock.mockReset();
  });

  it("returns 400 when monthA or monthB have invalid format", async () => {
    const req = { query: { monthA: "2026-13", monthB: "2026-11" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardComparison(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.success).toBe(false);
    expect(getStatusBreakdownsRepoMock).not.toHaveBeenCalled();
  });

  it("calculates comparison metrics, differences and percentage variations between monthA and monthB", async () => {
    // Month A (Oct 2026)
    getStatusBreakdownsRepoMock.mockResolvedValueOnce({
      ordersByStatus: {
        [OrderStatus.DELIVERED]: 40,
      },
      itemsByStatus: {
        [OrderStatus.DELIVERED]: 800,
      },
      conditionsByStatus: {
        [OrderStatus.DELIVERED]: { good: 780, bad: 10, stained: 10 },
      },
    });
    getInvoicedTotalRepoMock.mockResolvedValueOnce(5000);

    // Month B (Nov 2026)
    getStatusBreakdownsRepoMock.mockResolvedValueOnce({
      ordersByStatus: {
        [OrderStatus.DELIVERED]: 50,
      },
      itemsByStatus: {
        [OrderStatus.DELIVERED]: 1000,
      },
      conditionsByStatus: {
        [OrderStatus.DELIVERED]: { good: 975, bad: 10, stained: 15 },
      },
    });
    getInvoicedTotalRepoMock.mockResolvedValueOnce(6500.5);

    const req = { query: { monthA: "2026-10", monthB: "2026-11" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardComparison(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      monthA: "2026-10",
      monthB: "2026-11",
      rows: [
        {
          key: "totalItems",
          monthA: 800,
          monthB: 1000,
          difference: 200,
          variationPercent: 25,
        },
        {
          key: "totalOrders",
          monthA: 40,
          monthB: 50,
          difference: 10,
          variationPercent: 25,
        },
        {
          key: "totalStained",
          monthA: 10,
          monthB: 15,
          difference: 5,
          variationPercent: 50,
        },
        {
          key: "totalInvoiced",
          monthA: 5000,
          monthB: 6500.5,
          difference: 1500.5,
          variationPercent: 30,
        },
      ],
    });
  });

  it("handles base month with 0 values by returning null for variationPercent", async () => {
    // Month A with 0
    getStatusBreakdownsRepoMock.mockResolvedValueOnce({
      ordersByStatus: {},
      itemsByStatus: {},
      conditionsByStatus: {},
    });
    getInvoicedTotalRepoMock.mockResolvedValueOnce(0);

    // Month B with some values
    getStatusBreakdownsRepoMock.mockResolvedValueOnce({
      ordersByStatus: { [OrderStatus.DELIVERED]: 10 },
      itemsByStatus: { [OrderStatus.DELIVERED]: 150 },
      conditionsByStatus: { [OrderStatus.DELIVERED]: { good: 145, bad: 0, stained: 5 } },
    });
    getInvoicedTotalRepoMock.mockResolvedValueOnce(1200);

    const req = { query: { monthA: "2026-09", monthB: "2026-10" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardComparison(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const rows = res.body.data.rows;
    expect(rows.find((r: any) => r.key === "totalOrders")?.variationPercent).toBeNull();
    expect(rows.find((r: any) => r.key === "totalOrders")?.difference).toBe(10);
    expect(rows.find((r: any) => r.key === "totalInvoiced")?.variationPercent).toBeNull();
  });

  it("forwards clientId when provided", async () => {
    const clientId = "22222222-2222-4222-8222-222222222222";
    getStatusBreakdownsRepoMock.mockResolvedValue({
      ordersByStatus: {},
      itemsByStatus: {},
      conditionsByStatus: {},
    });
    getInvoicedTotalRepoMock.mockResolvedValue(0);

    const req = { query: { monthA: "2026-10", monthB: "2026-11", clientId } } as unknown as Request;
    const res = mockResponse();

    await getDashboardComparison(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getStatusBreakdownsRepoMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId })
    );
    expect(getInvoicedTotalRepoMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      clientId
    );
  });
});

