import pool from "../db/pool";
import { MachineRepository, MachineType, MachineStatus } from "../repositories/machine.repository";
import { OrderRepository } from "../repositories/order.repository";
import { OrderStatus } from "../types/orderStatus";
import type { EntityId } from "../utils/id";

export class MachineService {
  static async getAllMachines(
    limit: number,
    offset: number,
    filter: { search?: string | undefined; type?: MachineType | undefined; status?: MachineStatus | undefined } = {}
  ) {
    const [machines, total] = await Promise.all([
      MachineRepository.findAll(limit, offset, filter),
      MachineRepository.countAll(filter),
    ]);
    return { machines, total };
  }

  static async createMachine(data: { name: string; type: MachineType; capacity: number | string; status?: MachineStatus }) {
    const conn = await pool.getConnection();
    try {
      const parsedCapacity = typeof data.capacity === "number" ? data.capacity : parseFloat(String(data.capacity).replace(/[^0-9.]/g, "")) || 0;
      const id = await MachineRepository.insert(conn, {
        name: data.name,
        type: data.type,
        capacity: parsedCapacity,
        status: data.status || "available",
      });
      return MachineRepository.findById(id);
    } finally {
      conn.release();
    }
  }

  static async updateMachine(
    id: EntityId,
    data: Partial<{ name: string; type: MachineType; capacity: number | string; status: MachineStatus }>
  ) {
    const machine = await MachineRepository.findById(id);
    if (!machine) throw Object.assign(new Error("Machine not found"), { status: 404 });

    const updatePayload: any = { ...data };
    if (data.capacity !== undefined) {
      updatePayload.capacity = typeof data.capacity === "number" ? data.capacity : parseFloat(String(data.capacity).replace(/[^0-9.]/g, "")) || 0;
    }

    // If status is changed away from 'running', clear assigned order reference
    if (data.status && data.status !== "running" && machine.status === "running") {
      updatePayload.current_order_id = null;
      updatePayload.started_at = null;
    }

    await MachineRepository.update(id, updatePayload);
    return MachineRepository.findById(id);
  }

  static async deleteMachine(id: EntityId) {
    const machine = await MachineRepository.findById(id);
    if (!machine) throw Object.assign(new Error("Machine not found"), { status: 404 });
    if (machine.status === "running") {
      throw Object.assign(new Error("Cannot delete a machine that is currently running"), { status: 400 });
    }
    await MachineRepository.delete(id);
  }

  static async assignMachine(id: EntityId, orderId: EntityId, userId?: EntityId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const machine = await MachineRepository.findById(id);
      if (!machine) throw Object.assign(new Error("Machine not found"), { status: 404 });
      if (machine.status === "maintenance") {
        throw Object.assign(new Error("Machine is under maintenance"), { status: 400 });
      }

      // Verify order exists
      const order = await OrderRepository.findById(orderId);
      if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });

      // If order is currently assigned to another machine, release it from that machine first
      const existingAssignedMachine = await MachineRepository.findByOrderId(orderId);
      if (existingAssignedMachine && existingAssignedMachine.id !== id) {
        await MachineRepository.releaseOrder(existingAssignedMachine.id, orderId, conn);
      }

      await MachineRepository.assign(id, orderId, conn);

      // Determine stage status based on machine type or fallback to current order status
      let stageStatus: OrderStatus = order.status;
      if (machine.type === "washer") {
        stageStatus = OrderStatus.WASHING;
      } else if (machine.type === "dryer") {
        stageStatus = OrderStatus.DRYING;
      } else if (machine.type === "iron") {
        stageStatus = OrderStatus.IRONING;
      }

      const noteText = `Machine: ${machine.name}`;
      const updated = await OrderRepository.updateLatestHistoryNote(
        conn,
        orderId,
        stageStatus,
        noteText,
        userId
      );

      if (!updated) {
        await OrderRepository.insertHistory(conn, {
          order_id: orderId,
          changed_by_user_id: userId || null,
          is_system: false,
          status: stageStatus,
          note: noteText,
        });
      }

      await conn.commit();
      return MachineRepository.findById(id);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async releaseMachine(id: EntityId, orderId?: EntityId) {
    const machine = await MachineRepository.findById(id);
    if (!machine) throw Object.assign(new Error("Machine not found"), { status: 404 });

    if (orderId) {
      await MachineRepository.releaseOrder(id, orderId);
    } else {
      await MachineRepository.release(id);
    }
    return MachineRepository.findById(id);
  }

  static async seedMachines() {
    const count = await MachineRepository.countAll();
    if (count > 0) return { seeded: false, count };

    const defaults: { name: string; type: MachineType; capacity: number }[] = [
      { name: "Washer #1",      type: "washer", capacity: 25 },
      { name: "Washer #2",      type: "washer", capacity: 25 },
      { name: "Washer #3",      type: "washer", capacity: 15 },
      { name: "Dryer #1",       type: "dryer",  capacity: 30 },
      { name: "Dryer #2",       type: "dryer",  capacity: 30 },
      { name: "Dryer #3",       type: "dryer",  capacity: 20 },
      { name: "Iron Station #1",type: "iron",   capacity: 0  },
      { name: "Iron Station #2",type: "iron",   capacity: 0  },
    ];

    const conn = await pool.getConnection();
    try {
      await MachineRepository.bulkInsert(conn, defaults);
    } finally {
      conn.release();
    }

    const inserted = await MachineRepository.countAll();
    return { seeded: true, count: inserted };
  }
}
