import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "../../services/order.service";
import { MachineService } from "../../services/machine.service";
import { OrderRepository } from "../../repositories/order.repository";
import { MachineRepository } from "../../repositories/machine.repository";
import { OrderStatus } from "../../types/orderStatus";
import { AppError } from "../../utils/AppError";
import { authorizePermission } from "../../middleware/authorize";
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
    findItemsByOrderId: vi.fn().mockResolvedValue([]),
    findHistoryByOrderId: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    insertHistory: vi.fn().mockResolvedValue("hist-1"),
    updateLatestHistoryNote: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../../repositories/machine.repository", () => ({
  MachineRepository: {
    findById: vi.fn(),
    findByOrderId: vi.fn().mockResolvedValue(null),
    assign: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    releaseOrder: vi.fn().mockResolvedValue(undefined),
    releaseOrderByOrderId: vi.fn().mockResolvedValue(undefined),
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

describe("Operator Role Permissions and Processing Restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authorizePermission middleware for operator", () => {
    it("allows operator on orders:read and blocks operator on other permissions", () => {
      const next = vi.fn();
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      const req: any = {
        user: { userId: "op-1", role: "operator", permissions: [] },
      };

      authorizePermission("orders:read")(req, res, next);
      expect(next).toHaveBeenCalledOnce();

      next.mockClear();
      authorizePermission("orders:update")(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("OrderService.advanceStatus for operator", () => {
    it("allows operator to advance an order from ironing to quality_check", async () => {
      vi.mocked(OrderRepository.findById).mockResolvedValue({
        id: "ord-iron-1",
        status: OrderStatus.IRONING,
        is_invoiced: false,
      } as any);

      await OrderService.advanceStatus(
        "ord-iron-1",
        OrderStatus.QUALITY_CHECK,
        {},
        "op-1",
        "operator"
      );

      expect(OrderRepository.update).toHaveBeenCalledWith(
        "ord-iron-1",
        { status: OrderStatus.QUALITY_CHECK },
        expect.anything()
      );
    });

    it("blocks operator from advancing orders in other stages (e.g. arrived -> washing, drying -> ironing, quality_check -> ready_to_delivery)", async () => {
      vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
        id: "ord-1",
        status: OrderStatus.ARRIVED,
        is_invoiced: false,
      } as any);

      await expect(
        OrderService.advanceStatus("ord-1", OrderStatus.WASHING, {}, "op-1", "operator")
      ).rejects.toThrow(/Operators can only move orders from ironing to quality_check/);

      vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
        id: "ord-2",
        status: OrderStatus.DRYING,
        is_invoiced: false,
      } as any);

      await expect(
        OrderService.advanceStatus("ord-2", OrderStatus.IRONING, {}, "op-1", "operator")
      ).rejects.toThrow(/Operators can only move orders from ironing to quality_check/);

      vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
        id: "ord-3",
        status: OrderStatus.QUALITY_CHECK,
        is_invoiced: false,
      } as any);

      await expect(
        OrderService.advanceStatus("ord-3", OrderStatus.READY_TO_DELIVERY, {}, "op-1", "operator")
      ).rejects.toThrow(/Operators can only move orders from ironing to quality_check/);
    });
  });

  describe("MachineService assign/release restrictions for operator", () => {
    it("allows operator to assign and release an iron machine when order is in ironing", async () => {
      vi.mocked(MachineRepository.findById).mockResolvedValue({
        id: "mach-iron-1",
        name: "Iron #1",
        type: "iron",
        status: "available",
      } as any);
      vi.mocked(OrderRepository.findById).mockResolvedValue({
        id: "ord-iron-1",
        status: OrderStatus.IRONING,
      } as any);

      await MachineService.assignMachine("mach-iron-1", "ord-iron-1", "op-1", "operator");
      expect(MachineRepository.assign).toHaveBeenCalledWith("mach-iron-1", "ord-iron-1", expect.anything());

      await MachineService.releaseMachine("mach-iron-1", "ord-iron-1", "operator");
      expect(MachineRepository.releaseOrder).toHaveBeenCalledWith("mach-iron-1", "ord-iron-1");
    });

    it("blocks operator from assigning or releasing a washer/dryer or an order not in ironing", async () => {
      vi.mocked(MachineRepository.findById).mockResolvedValueOnce({
        id: "mach-wash-1",
        name: "Washer #1",
        type: "washer",
        status: "available",
      } as any);
      vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
        id: "ord-wash-1",
        status: OrderStatus.WASHING,
      } as any);

      await expect(
        MachineService.assignMachine("mach-wash-1", "ord-wash-1", "op-1", "operator")
      ).rejects.toThrow(/Operators can only assign iron machines/);

      vi.mocked(MachineRepository.findById).mockResolvedValueOnce({
        id: "mach-wash-1",
        name: "Washer #1",
        type: "washer",
        status: "running",
      } as any);

      await expect(
        MachineService.releaseMachine("mach-wash-1", "ord-wash-1", "operator")
      ).rejects.toThrow(/Operators can only release iron machines/);
    });
  });
});

describe("Staff Role Permissions and Restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows staff on orders:read, orders:create, orders:update and blocks staff on orders:delete", () => {
    const next = vi.fn();
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const req: any = {
      user: { userId: "staff-1", role: "staff", permissions: [] },
    };

    authorizePermission("orders:read")(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    authorizePermission("orders:create")(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    authorizePermission("orders:update")(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);

    next.mockClear();
    authorizePermission("orders:delete")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("blocks staff from editing orders generally or in non-quality_check statuses", async () => {
    vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
      id: "ord-1",
      status: OrderStatus.PENDING,
      is_invoiced: false,
      client_id: "client-1",
    } as any);

    await expect(
      OrderService.updateOrder("ord-1", { special_notes: "test" }, "staff-1", "staff")
    ).rejects.toThrow(/Staff cannot edit orders/);

    vi.mocked(OrderRepository.findById).mockResolvedValueOnce({
      id: "ord-2",
      status: OrderStatus.QUALITY_CHECK,
      is_invoiced: false,
      client_id: "client-1",
    } as any);

    await expect(
      OrderService.updateOrder("ord-2", { special_notes: "test" }, "staff-1", "staff")
    ).rejects.toThrow(/Staff cannot edit orders/);
  });

  it("blocks staff from rescheduling, cancelling, reassigning, or confirming driver pickup/delivery/collection", async () => {
    vi.mocked(OrderRepository.findById).mockResolvedValue({
      id: "ord-1",
      status: OrderStatus.PENDING,
      is_invoiced: false,
      client_id: "client-1",
    } as any);

    await expect(
      OrderService.rescheduleOrder(
        "ord-1",
        {
          pickup_date: "2099-12-31",
          pickup_window: {
            start_time: "2099-12-31T08:00:00Z",
            end_time: "2099-12-31T10:00:00Z",
          },
        },
        "staff-1",
        "staff"
      )
    ).rejects.toThrow(/do not have permission to reschedule/);

    await expect(
      OrderService.deleteOrder("ord-1", "staff-1", "staff")
    ).rejects.toThrow(/Only administrators or clients can cancel orders/);

    await expect(
      OrderService.advanceStatus("ord-1", OrderStatus.CANCELLED, {}, "staff-1", "staff")
    ).rejects.toThrow(/Staff cannot cancel orders/);

    await expect(
      OrderService.reassignOrder("ord-1", "driver-1", "staff-1", "staff")
    ).rejects.toThrow(/Only administrators can reassign orders/);

    await expect(
      OrderService.confirmPickup("ord-1", { actual_bags: 1 }, "staff-1", "staff")
    ).rejects.toThrow(/Only drivers or admin can confirm pickups/);

    await expect(
      OrderService.confirmCollection("ord-1", "staff-1", "staff")
    ).rejects.toThrow(/Only drivers or admin can confirm collection/);

    await expect(
      OrderService.confirmDelivery("ord-1", { packages_delivered: 1 }, "staff-1", "staff")
    ).rejects.toThrow(/Only drivers or admin can confirm delivery/);
  });
});
