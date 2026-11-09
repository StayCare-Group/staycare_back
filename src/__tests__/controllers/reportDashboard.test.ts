import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const { getStatusBreakdownsRepoMock } = vi.hoisted(() => ({
  getStatusBreakdownsRepoMock: vi.fn(),
}));

vi.mock("../../repositories/report.repository", () => ({
  ReportRepository: { getDashboardStatusBreakdowns: getStatusBreakdownsRepoMock },
}));

import { getDashboardOverview } from "../../controllers/report.controller";
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

  it("converts the Malta range to UTC and aggregates itemsPending, itemsProcessed and itemsDelivered", async () => {
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    getStatusBreakdownsRepoMock.mockRejectedValue(new Error("db down"));
    const req = { query: { from: "2026-11-01", to: "2026-11-01" } } as unknown as Request;
    const res = mockResponse();

    await getDashboardOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
