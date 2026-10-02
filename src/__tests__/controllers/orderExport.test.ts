import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportOrdersFlat, exportOrdersStained } from "../../controllers/order.controller";
import { OrderRepository } from "../../repositories/order.repository";
import type { Request, Response } from "express";

vi.mock("../../repositories/order.repository", () => ({
  OrderRepository: {
    findManyForExport: vi.fn(),
  },
}));

function mockResponse() {
  const res: Partial<Response> = {};
  res.statusCode = 200;
  res.headers = {} as Record<string, string>;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: any) => {
    (res as any).body = data;
    return res;
  });
  res.setHeader = vi.fn().mockImplementation((key: string, val: string) => {
    (res.headers as Record<string, string>)[key] = val;
    return res;
  });
  res.send = vi.fn().mockImplementation((data: any) => {
    (res as any).body = data;
    return res;
  });
  return res as Response & { body: any; headers: Record<string, string> };
}

describe("Order Exports (exportOrdersFlat & exportOrdersStained)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exportOrdersStained", () => {
    it("returns 400 if ids is missing or empty", async () => {
      const req = { body: { ids: [] } } as Request;
      const res = mockResponse();

      await exportOrdersStained(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toMatchObject({
        success: false,
        message: expect.stringContaining("ids must be a non-empty array"),
      });
    });

    it("returns 404 if no orders found for provided ids", async () => {
      vi.mocked(OrderRepository.findManyForExport).mockResolvedValueOnce([]);

      const req = { body: { ids: ["ord-1"] } } as Request;
      const res = mockResponse();

      await exportOrdersStained(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.body).toMatchObject({
        success: false,
        message: expect.stringContaining("No orders found"),
      });
    });

    it("exports orders with stained items quantity and exact requested headers", async () => {
      const mockExportData: any[] = [
        {
          id: "ord-1",
          order_number: "ORD-001",
          client_name: "Hotel Paradise",
          property_name: "Villa Sol",
          created_at: "2026-10-01",
          special_notes: "Handle with care, delicate linens",
          items: [
            { name: "Towel", qty_good: 10, qty_bad: 1, qty_stained: 3, quantity: 14 },
            { name: "Sheet", qty_good: 5, qty_bad: 0, qty_stained: 2, quantity: 7 },
          ],
        },
        {
          id: "ord-2",
          order_number: "ORD-002",
          client_name: "Hostel Central",
          property_name: null,
          created_at: "2026-10-02",
          special_notes: null,
          items: [
            { name: "Sheet", qty_good: 8, qty_bad: 0, qty_stained: 0, quantity: 8 },
            { name: "Pillowcase", qty_good: 4, qty_bad: 0, qty_stained: 5, quantity: 9 },
          ],
        },
      ];

      vi.mocked(OrderRepository.findManyForExport).mockResolvedValueOnce(mockExportData);

      const req = { body: { ids: ["ord-1", "ord-2"] } } as Request;
      const res = mockResponse();

      await exportOrdersStained(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
      expect(res.headers["Content-Disposition"]).toMatch(/^attachment; filename="Ordenes-Manchados-StayCare-\d{4}-\d{2}-\d{2}\.csv"$/);

      const bodyStr = res.body as string;
      expect(bodyStr.startsWith("\uFEFF")).toBe(true);

      const csvContent = bodyStr.slice(1);
      const lines = csvContent.split("\n");

      // Check header line: Fixed headers + sorted item names (Pillowcase, Sheet, Towel)
      expect(lines[0]).toBe('Order ID,Client,Property,Created Date,Special Notes,Pillowcase,Sheet,Towel');

      // Check row 1 (ORD-001)
      // Notes contains a comma, so it must be escaped with quotes
      expect(lines[1]).toBe('ORD-001,Hotel Paradise,Villa Sol,2026-10-01,"Handle with care, delicate linens",0,2,3');

      // Check row 2 (ORD-002)
      expect(lines[2]).toBe('ORD-002,Hostel Central,,2026-10-02,,5,0,0');
    });
  });

  describe("exportOrdersFlat", () => {
    it("returns 400 if ids is missing or empty", async () => {
      const req = { body: { ids: [] } } as Request;
      const res = mockResponse();

      await exportOrdersFlat(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("exports orders in flat format with all standard headers", async () => {
      const mockExportData: any[] = [
        {
          id: "ord-1",
          order_number: "ORD-001",
          client_name: "Hotel Paradise",
          property_name: "Villa Sol",
          created_at: "2026-10-01",
          pickup_date: "2026-10-02",
          service_type: "standard",
          status: "pending",
          actual_bags: 2,
          special_notes: "Test notes",
          total: 150,
          history: [],
          items: [{ name: "Towel", qty_good: 10, qty_bad: 0, qty_stained: 2, quantity: 12 }],
        },
      ];

      vi.mocked(OrderRepository.findManyForExport).mockResolvedValueOnce(mockExportData);

      const req = { body: { ids: ["ord-1"] } } as Request;
      const res = mockResponse();

      await exportOrdersFlat(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.headers["Content-Disposition"]).toMatch(/^attachment; filename="Ordenes-Resumen-StayCare-\d{4}-\d{2}-\d{2}\.csv"$/);

      const csvContent = (res.body as string).slice(1);
      const lines = csvContent.split("\n");
      expect(lines[0]).toContain("Order ID,Client,Property,Created Date,Pickup Date");
      expect(lines[1]).toContain("ORD-001,Hotel Paradise,Villa Sol,2026-10-01");
    });
  });
});
