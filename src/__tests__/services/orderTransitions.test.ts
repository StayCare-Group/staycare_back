import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "../../services/order.service";
import { OrderRepository } from "../../repositories/order.repository";
import { OrderStatus } from "../../types/orderStatus";
import { AppError } from "../../utils/AppError";
import pool from "../../db/pool";

vi.mock("../../db/pool", () => {
  const mockConn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([{}]),
  };
  return {
    default: {
      getConnection: vi.fn().mockResolvedValue(mockConn),
      execute: vi.fn().mockResolvedValue([{}]),
    },
  };
});

vi.mock("../../repositories/order.repository", () => ({
  OrderRepository: {
    findById: vi.fn(),
    findByIdForUpdate: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    insertHistory: vi.fn().mockResolvedValue("hist-1"),
  },
}));

vi.mock("../../services/invoice.service", () => ({
  InvoiceService: {
    createAutomaticInvoice: vi.fn().mockResolvedValue(null),
  },
}));

describe("OrderService Delivery and Pickup Double-Submit Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("_confirmDeliverySingle", () => {
    const confirmDeliverySingle = (OrderService as any)._confirmDeliverySingle.bind(OrderService);

    it("throws AppError if order is already in DELIVERED status", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValue({
        id: "ord-1",
        status: OrderStatus.DELIVERED,
        driver_id: "driver-1",
      } as any);

      await expect(
        confirmDeliverySingle("ord-1", { packages_delivered: 1 }, "driver-1", "driver")
      ).rejects.toThrow(AppError);

      await expect(
        confirmDeliverySingle("ord-1", { packages_delivered: 1 }, "admin-1", "admin")
      ).rejects.toThrow(/already been delivered/);
    });

    it("throws AppError if order is in COMPLETED status", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.COMPLETED,
        driver_id: "driver-1",
      } as any);

      await expect(
        confirmDeliverySingle("ord-1", { packages_delivered: 1 }, "admin-1", "admin")
      ).rejects.toThrow(/already been delivered/);
    });

    it("throws AppError if order is in CANCELLED status", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.CANCELLED,
        driver_id: "driver-1",
      } as any);

      await expect(
        confirmDeliverySingle("ord-1", { packages_delivered: 1 }, "admin-1", "admin")
      ).rejects.toThrow(/Cannot deliver cancelled order/);
    });
  });

  describe("_confirmPickupSingle", () => {
    const confirmPickupSingle = (OrderService as any)._confirmPickupSingle.bind(OrderService);

    it("throws AppError if pickup has already been confirmed (TRANSIT)", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.TRANSIT,
        driver_id: "driver-1",
      } as any);

      await expect(
        confirmPickupSingle("ord-1", { actual_bags: 2 }, "driver-1", "driver")
      ).rejects.toThrow(/Pickup has already been confirmed/);
    });

    it("throws AppError if order is in post-pickup status (e.g. ARRIVED or DELIVERED)", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.ARRIVED,
        driver_id: "driver-1",
      } as any);

      await expect(
        confirmPickupSingle("ord-1", { actual_bags: 2 }, "admin-1", "admin")
      ).rejects.toThrow(/Cannot confirm pickup/);
    });
  });

  describe("confirmCollection", () => {
    it("throws AppError if order is already collected", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.COLLECTED,
      } as any);

      await expect(
        OrderService.confirmCollection("ord-1", "driver-1", "driver")
      ).rejects.toThrow(/already been collected/);
    });

    it("throws AppError if order is already delivered", async () => {
      vi.mocked(OrderRepository.findByIdForUpdate).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.DELIVERED,
      } as any);

      await expect(
        OrderService.confirmCollection("ord-1", "driver-1", "driver")
      ).rejects.toThrow(/already been delivered/);
    });
  });
});
