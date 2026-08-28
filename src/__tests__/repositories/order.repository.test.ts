import { describe, it, expect } from "vitest";
import {
  toDbOrderStatus,
  fromDbOrderStatus,
} from "../../repositories/order.repository";
import { OrderStatus } from "../../types/orderStatus";

/**
 * Tests para src/repositories/order.repository.ts
 *
 * Funciones puras de mapeo de estados interno:
 * - toDbOrderStatus: Traduce OrderStatus (snake_case) al formato PascalCase de MySQL.
 * - fromDbOrderStatus: Traduce el formato PascalCase de MySQL al OrderStatus canónico (snake_case).
 */

describe("order.repository — toDbOrderStatus", () => {
  it("convierte cada OrderStatus al valor PascalCase que espera MySQL", () => {
    expect(toDbOrderStatus(OrderStatus.PENDING)).toBe("Pending");
    expect(toDbOrderStatus(OrderStatus.ASSIGNED)).toBe("Assigned");
    expect(toDbOrderStatus(OrderStatus.TRANSIT)).toBe("Transit");
    expect(toDbOrderStatus(OrderStatus.ARRIVED)).toBe("Arrived");
    expect(toDbOrderStatus(OrderStatus.WASHING)).toBe("Washing");
    expect(toDbOrderStatus(OrderStatus.DRYING)).toBe("Drying");
    expect(toDbOrderStatus(OrderStatus.IRONING)).toBe("Ironing");
    expect(toDbOrderStatus(OrderStatus.QUALITY_CHECK)).toBe("QualityCheck");
    expect(toDbOrderStatus(OrderStatus.READY_TO_DELIVERY)).toBe("ReadyToDeliver");
    expect(toDbOrderStatus(OrderStatus.COLLECTED)).toBe("Collected");
    expect(toDbOrderStatus(OrderStatus.DELIVERED)).toBe("Delivered");
    expect(toDbOrderStatus(OrderStatus.COMPLETED)).toBe("Completed");
    expect(toDbOrderStatus(OrderStatus.CANCELLED)).toBe("Cancelled");
    expect(toDbOrderStatus(OrderStatus.RESCHEDULED)).toBe("Rescheduled");
  });

  it("acepta strings con mayúsculas o espacios extra (normaliza antes de mapear)", () => {
    expect(toDbOrderStatus("  PENDING  ")).toBe("Pending");
    expect(toDbOrderStatus("Washing")).toBe("Washing");
    expect(toDbOrderStatus("QUALITY_CHECK")).toBe("QualityCheck");
  });

  it("devuelve el valor original si el status es desconocido (sin crash)", () => {
    expect(toDbOrderStatus("unknown_status")).toBe("unknown_status");
  });

  it("devuelve el valor tal cual si no es un string (number, null, etc.)", () => {
    expect(toDbOrderStatus(42)).toBe(42);
    expect(toDbOrderStatus(null)).toBe(null);
  });
});

describe("order.repository — fromDbOrderStatus", () => {
  it("convierte cada valor PascalCase de MySQL al snake_case del enum", () => {
    expect(fromDbOrderStatus("Pending")).toBe("pending");
    expect(fromDbOrderStatus("Assigned")).toBe("assigned");
    expect(fromDbOrderStatus("Transit")).toBe("transit");
    expect(fromDbOrderStatus("Arrived")).toBe("arrived");
    expect(fromDbOrderStatus("Washing")).toBe("washing");
    expect(fromDbOrderStatus("Drying")).toBe("drying");
    expect(fromDbOrderStatus("Ironing")).toBe("ironing");
    expect(fromDbOrderStatus("QualityCheck")).toBe("quality_check");
    expect(fromDbOrderStatus("ReadyToDeliver")).toBe("ready_to_delivery");
    expect(fromDbOrderStatus("Collected")).toBe("collected");
    expect(fromDbOrderStatus("Delivered")).toBe("delivered");
    expect(fromDbOrderStatus("Completed")).toBe("completed");
    expect(fromDbOrderStatus("Cancelled")).toBe("cancelled");
    expect(fromDbOrderStatus("Rescheduled")).toBe("rescheduled");
  });

  it("devuelve el valor en lowercase si viene un status desconocido de MySQL", () => {
    expect(fromDbOrderStatus("SomeNewStatus")).toBe("somenewstatus");
  });

  it("devuelve string vacío si recibe string vacío (sin crash)", () => {
    expect(fromDbOrderStatus("")).toBe("");
  });

  it("el round-trip es simétrico para todos los statuses conocidos", () => {
    const statuses = Object.values(OrderStatus);
    for (const status of statuses) {
      const dbValue = toDbOrderStatus(status);
      const backToEnum = fromDbOrderStatus(dbValue);
      expect(backToEnum).toBe(status);
    }
  });
});
