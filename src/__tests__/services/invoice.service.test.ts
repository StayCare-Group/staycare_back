import { describe, it, expect, vi, beforeEach } from "vitest";

const conn = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

vi.mock("../../db/pool", () => ({
  default: { getConnection: vi.fn(async () => conn) },
}));

vi.mock("../../repositories/order.repository", () => ({
  OrderRepository: {
    findByIdForUpdate: vi.fn(),
    findItemsByOrderId: vi.fn(),
    update: vi.fn(),
    insertHistory: vi.fn(),
  },
}));

vi.mock("../../repositories/invoice.repository", () => ({
  InvoiceRepository: {
    insert: vi.fn(async () => "inv-1"),
    insertLineItem: vi.fn(),
    linkOrder: vi.fn(),
    findById: vi.fn(async () => ({ id: "inv-1" })),
  },
}));

vi.mock("../../repositories/clientProfile.repository", () => ({
  ClientProfileRepository: {
    findUserIdByProfileId: vi.fn(async () => null),
  },
}));

import { InvoiceService } from "../../services/invoice.service";
import { OrderRepository } from "../../repositories/order.repository";
import { InvoiceRepository } from "../../repositories/invoice.repository";
import { OrderStatus } from "../../types/orderStatus";

const baseInput = {
  client_id: "client-1",
  order_ids: ["order-1"],
  due_date: "2026-11-30",
  subtotal: 0,
  vat_percentage: 18,
  vat_amount: 0,
  total: 0,
};

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1",
  order_number: "ORD-1",
  client_id: "client-1",
  status: OrderStatus.DELIVERED,
  is_invoiced: false,
  subtotal: 100,
  vat_amount: 18,
  total: 118,
  ...overrides,
});

const orderItems = [
  { name_snapshot: "Towel", quantity: 10, unit_price: 10, total_price: 100 },
];

describe("InvoiceService.createInvoice validations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(OrderRepository.findItemsByOrderId).mockResolvedValue(orderItems as any);
  });

  it("creates the invoice for an invoiceable order of the same client", async () => {
    vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce(makeOrder() as any);

    await InvoiceService.createInvoice(baseInput, "admin-1");

    expect(OrderRepository.findByIdForUpdate).toHaveBeenCalledWith(conn, "order-1");
    expect(InvoiceRepository.insert).toHaveBeenCalledTimes(1);
    expect(OrderRepository.update).toHaveBeenCalledWith("order-1", { is_invoiced: true }, conn);
    expect(conn.commit).toHaveBeenCalled();
  });

  it("allows invoicing right after the order was received in plant (arrived)", async () => {
    vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce(
      makeOrder({ status: OrderStatus.ARRIVED }) as any
    );

    await expect(InvoiceService.createInvoice(baseInput, "admin-1")).resolves.toBeTruthy();
  });

  it.each([OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.TRANSIT, OrderStatus.CANCELLED, OrderStatus.RESCHEDULED])(
    "rejects orders not yet received in plant (%s)",
    async (status) => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce(makeOrder({ status }) as any);

      await expect(InvoiceService.createInvoice(baseInput, "admin-1")).rejects.toThrow(/recibida en planta/);
      expect(InvoiceRepository.insert).not.toHaveBeenCalled();
      expect(conn.rollback).toHaveBeenCalled();
    }
  );

  it("rejects an order that is already invoiced", async () => {
    vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce(
      makeOrder({ is_invoiced: true }) as any
    );

    await expect(InvoiceService.createInvoice(baseInput, "admin-1")).rejects.toThrow(/ya ha sido facturada/);
    expect(InvoiceRepository.insert).not.toHaveBeenCalled();
  });

  it("rejects orders belonging to a different client", async () => {
    vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce(
      makeOrder({ client_id: "other-client" }) as any
    );

    await expect(InvoiceService.createInvoice(baseInput, "admin-1")).rejects.toThrow(/no pertenece al cliente/);
    expect(InvoiceRepository.insert).not.toHaveBeenCalled();
  });

  it("rejects duplicated order IDs in the same request", async () => {
    await expect(
      InvoiceService.createInvoice({ ...baseInput, order_ids: ["order-1", "order-1"] }, "admin-1")
    ).rejects.toThrow(/duplicados/);
    expect(OrderRepository.findByIdForUpdate).not.toHaveBeenCalled();
  });
});
