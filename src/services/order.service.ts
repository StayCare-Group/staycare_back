import pool from "../db/pool";
import { OrderRepository, IOrderMySQL } from "../repositories/order.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { ItemRepository } from "../repositories/item.repository";
import { OrderStatus } from "../types/orderStatus";
import { sendOrderStatusEmail } from "../utils/mail";
import { PoolConnection } from "mysql2/promise";
import { AppError } from "../utils/AppError";
import { InvoiceService } from "./invoice.service";
import { MachineRepository } from "../repositories/machine.repository";
import { PricingService } from "./pricing.service";

const EXPRESS_SURCHARGE = 25.0;

/**
 * Ordered pipeline of in-plant processing stages.
 * Used to detect rollback operations (moving to an earlier stage).
 */
const PROCESSING_PIPELINE: OrderStatus[] = [
  OrderStatus.ARRIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.QUALITY_CHECK,
];


function toDateString(val: string | Date | null | undefined): string {
  if (!val) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function getTodayString(): string {
  return toDateString(new Date());
}

function isDateInPast(val: string | Date): boolean {
  const target = toDateString(val);
  const today = getTodayString();
  if (!target || !today) return false;
  return target < today;
}

function appendNote(existingNote: string | null | undefined, newText: string | null | undefined, authorLabel: string): string | null {
  if (!newText || !newText.trim()) return existingNote || null;
  const trimmedNew = newText.trim();
  const formattedNew = trimmedNew.startsWith("[") ? trimmedNew : `[${authorLabel}]: ${trimmedNew}`;
  if (!existingNote || !existingNote.trim()) return formattedNew;
  if (existingNote.includes(formattedNew)) return existingNote;
  return `${existingNote.trim()}\n${formattedNew}`;
}

export class OrderService {
  private static async notifyClientOfStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const NOTIFY_STATUSES = new Set([
      OrderStatus.ASSIGNED,
      OrderStatus.TRANSIT,
      OrderStatus.ARRIVED,
      OrderStatus.READY_TO_DELIVERY,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ]);

    if (!NOTIFY_STATUSES.has(newStatus)) return;
    try {
      const order = await OrderRepository.findById(orderId);
      if (!order || !order.client_id) return;

      const [uRows]: any = await pool.execute(
        "SELECT email, name as contact_person FROM users WHERE id = ?",
        [order.client_id]
      );
      const user = uRows[0];
      if (!user?.email) return;

      await sendOrderStatusEmail(user.email, order.order_number, newStatus, user.contact_person);
    } catch { /* best-effort */ }
  }

  private static generateOrderNumber(): string {
    const date = new Date();
    const y = date.getFullYear().toString().slice(-2);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${y}${m}${d}-${rand}`;
  }

  private static async calculateTotals(
    items: { item_id: string; quantity: number }[],
    serviceType: "standard" | "express",
    clientId?: string | null,
    existingOrderItems?: { item_id: string | null; unit_price: number }[]
  ) {
    let subtotal = 0;
    const vatPercentage = 18;
    const calculatedItems = [];

    // Separate items that already exist in the order from completely new items
    const newItemsToResolve = [];
    const itemsWithFrozenPrice = [];

    for (const item of items) {
      const existing = existingOrderItems?.find(e => String(e.item_id) === String(item.item_id));
      if (existing) {
        itemsWithFrozenPrice.push({ ...item, frozen_unit_price: existing.unit_price });
      } else {
        newItemsToResolve.push(item);
      }
    }

    // Resolve prices for completely new items using the client's current price list
    const resolvedNewItems = await PricingService.resolveOrderItemsPrices(clientId!, newItemsToResolve);

    for (const item of items) {
      const existing = itemsWithFrozenPrice.find(i => String(i.item_id) === String(item.item_id));
      
      let unitPrice: number;
      let itemCode: string;
      let name: string;

      if (existing) {
        // Use frozen price
        const itemDef = await ItemRepository.findById(item.item_id);
        if (!itemDef) throw new AppError(`Item with ID ${item.item_id} not found.`, 404);
        unitPrice = Number(existing.frozen_unit_price);
        itemCode = itemDef.item_code;
        name = itemDef.name;
      } else {
        // Use newly resolved price
        const resolved = resolvedNewItems.find(r => String(r.item_id) === String(item.item_id));
        if (!resolved) throw new AppError(`Could not resolve price for item ${item.item_id}`, 500);
        unitPrice = Number(resolved.unit_price);
        itemCode = resolved.item_code;
        name = resolved.name;
      }

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      calculatedItems.push({
        item_id: item.item_id,
        item_code: itemCode,
        name: name,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    const vatAmount = parseFloat((subtotal * (vatPercentage / 100)).toFixed(2));
    const surcharge = serviceType === "express" ? EXPRESS_SURCHARGE : 0;
    const total = parseFloat((subtotal + vatAmount + surcharge).toFixed(2));

    return {
      subtotal,
      vatPercentage,
      vatAmount,
      surcharge,
      total,
      calculatedItems,
    };
  }

  static async getAllOrders(filter: any, limit: number, offset: number) {
    const [orders, total] = await Promise.all([
      OrderRepository.findManyFiltered(filter, limit, offset),
      OrderRepository.countFiltered(filter),
    ]);
    return { orders, total };
  }

  static async getOrderById(id: string) {
    const order = await OrderRepository.findById(id);
    if (!order) return null;
    const items = await OrderRepository.findItemsByOrderId(id);
    const history = await OrderRepository.findHistoryByOrderId(id);
    return { ...order, items, status_history: history };
  }

  static async createOrder(data: any, userId: string, role: string) {
    if (data.pickup_date && isDateInPast(data.pickup_date)) {
      throw new AppError("The pickup date cannot be in the past.", 400);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let clientId = data.client_id;
      if (role === "client") {
        clientId = userId;
      } else {
        if (!clientId) {
          throw new Error("A client_id (user ID) is required to create an order as admin/staff.");
        }
        // Verify user exists and is active
        const [user]: any = await pool.execute("SELECT id, is_active FROM users WHERE id = ?", [clientId]);
        if (user.length === 0) {
          throw new AppError(`Client (User) with ID ${clientId} not found.`, 404);
        }
        if (!user[0].is_active) {
          throw new AppError("Cannot create an order for a deactivated client", 400);
        }
      }

      const orderNumber = this.generateOrderNumber();

      const {
        subtotal,
        vatPercentage,
        vatAmount,
        total,
        calculatedItems
      } = await this.calculateTotals(data.items || [], data.service_type || "standard", clientId);

      const initialNotes = appendNote(null, data.special_notes, "pending");

      const orderData: Omit<IOrderMySQL, "id" | "created_at" | "updated_at"> = {
        order_number: orderNumber,
        client_id: clientId,
        property_id: data.property_id || null,
        driver_id: null,
        service_type: data.service_type || "standard",
        pickup_date: new Date(data.pickup_date),
        pickup_window_start: new Date(data.pickup_window.start_time),
        pickup_window_end: new Date(data.pickup_window.end_time),
        estimated_bags: data.estimated_bags || null,
        actual_bags: null,
        staff_confirmed_bags: null,
        special_notes: initialNotes,
        status: OrderStatus.PENDING,
        is_invoiced: false,
        subtotal,
        vat_percentage: vatPercentage,
        vat_amount: vatAmount,
        total,
      };

      const orderId = await OrderRepository.insert(conn, orderData);

      for (const item of calculatedItems) {
        await OrderRepository.insertItem(conn, {
          order_id: orderId,
          item_id: item.item_id,
          item_code_snapshot: item.item_code,
          name_snapshot: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          qty_good: item.quantity,
          qty_bad: 0,
          qty_stained: 0,
        });
      }

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.PENDING,
        note: "Order created",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.PENDING);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async receiveInPlant(
    orderId: string,
    userId: string,
    data: {
      staff_confirmed_bags: number;
      special_notes?: string;
      items: { item_id: string; quantity: number; qty_good: number; qty_bad: number; qty_stained: number }[]
    }
  ) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await MachineRepository.releaseOrderByOrderId(orderId, conn);

      const order = await OrderRepository.findById(orderId);
      if (!order) throw new AppError("Order not found", 404);

      // Block if BOTH invoiced AND completed
      if (order.is_invoiced && order.status === OrderStatus.COMPLETED) {
        throw new AppError("Cannot receive or modify an order that is already invoiced and completed.", 403);
      }

      const existingItems = await OrderRepository.findItemsByOrderId(orderId);

      // 1. Clear existing items
      await OrderRepository.deleteItemsByOrderId(conn, orderId);

      // Validate item quantity consistency
      for (const item of data.items) {
        const sum = (item.qty_good || 0) + (item.qty_bad || 0) + (item.qty_stained || 0);
        if (sum !== item.quantity) {
          throw new AppError(`Item quantity mismatch (ID: ${item.item_id}): The sum of conditions (${sum}) does not match the total quantity (${item.quantity}).`, 400);
        }
      }

      // 2. Re-calculate financials based on staff-provided items
      const {
        subtotal,
        vatAmount,
        total,
        calculatedItems
      } = await this.calculateTotals(data.items || [], order.service_type, order.client_id, existingItems);

      for (const item of calculatedItems) {
        const sourceItem = data.items.find(i => i.item_id === item.item_id);
        await OrderRepository.insertItem(conn, {
          order_id: orderId,
          item_id: item.item_id,
          item_code_snapshot: item.item_code,
          name_snapshot: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          qty_good: sourceItem?.qty_good || 0,
          qty_bad: sourceItem?.qty_bad || 0,
          qty_stained: sourceItem?.qty_stained || 0,
        });
      }

      const incomingNote = data.special_notes;
      const updatedNotes = appendNote(order.special_notes, incomingNote, "arrived");

      // 3. Update order status, confirmed bags, and financials
      await OrderRepository.update(orderId, {
        status: OrderStatus.ARRIVED,
        staff_confirmed_bags: data.staff_confirmed_bags,
        subtotal,
        vat_amount: vatAmount,
        total,
        ...(updatedNotes ? { special_notes: updatedNotes } : {}),
      }, conn);

      // 4. Record history
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.ARRIVED,
        note: "Inventory verified and order value finalized by staff in plant",
      });

      await conn.commit();
      return await this.getOrderById(orderId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async updateOrder(id: string, data: any, userId: string, role?: string, parentClientId?: string | null) {
    const order = await OrderRepository.findById(id);
    if (!order) throw new AppError("Order not found", 404);

    const isAdminOrStaff = role === "admin" || role === "staff";
    const effectiveClientId = parentClientId ?? userId;
    const isClientContext = role === "client" || !!parentClientId;

    if (role && !isAdminOrStaff) {
      if (isClientContext && String(order.client_id) !== String(effectiveClientId)) {
        throw new AppError("Forbidden: You can only edit orders belonging to your client account.", 403);
      }
    }

    if (order.is_invoiced) {
      throw new AppError("Cannot modify order: Order is already invoiced.", 400);
    }

    const statusRaw = String(order.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

    // Pre-receive statuses allowed for clients / sub-users
    const PRE_RECEIVE_STATUSES = new Set([
      OrderStatus.PENDING,
      OrderStatus.ASSIGNED,
      OrderStatus.RESCHEDULED,
      OrderStatus.TRANSIT,
      "pending",
      "assigned",
      "rescheduled",
      "transit",
      "in_transit",
    ]);

    if (role && !isAdminOrStaff && !PRE_RECEIVE_STATUSES.has(statusRaw as any)) {
      throw new AppError("Cannot modify order: Once the order has been received at the facility, editing is restricted to admin and staff.", 400);
    }

    // Block editing for admin/staff if past quality_check
    const NON_EDITABLE_STATUSES = new Set([
      OrderStatus.READY_TO_DELIVERY,
      OrderStatus.COLLECTED,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      "ready_to_delivery",
      "collected",
      "delivered",
      "completed",
      "cancelled",
    ]);

    if (NON_EDITABLE_STATUSES.has(statusRaw as any)) {
      throw new AppError(`Cannot modify order: Order is in status '${order.status}'. Editing is only permitted up to quality_check.`, 400);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const { items, pickup_window, ...rest } = data;
      const updateData: any = { ...rest };

      if (data.pickup_date) {
        const origDateStr = toDateString(order.pickup_date);
        const newDateStr = toDateString(data.pickup_date);
        if (newDateStr !== origDateStr && isDateInPast(data.pickup_date)) {
          throw new AppError("The pickup date cannot be in the past.", 400);
        }
        updateData.pickup_date = new Date(data.pickup_date);
      }

      if (pickup_window) {
        updateData.pickup_window_start = new Date(pickup_window.start_time);
        updateData.pickup_window_end = new Date(pickup_window.end_time);
      }

      if (items && Array.isArray(items)) {
        const existingItems = await OrderRepository.findItemsByOrderId(id);
        await OrderRepository.deleteItemsByOrderId(conn, id);

        const {
          subtotal,
          vatAmount,
          total,
          calculatedItems
        } = await this.calculateTotals(items, data.service_type || order.service_type, order.client_id, existingItems);

        for (const item of calculatedItems) {
          const sourceItem = items.find((i: any) => i.item_id === item.item_id);
          await OrderRepository.insertItem(conn, {
            order_id: id,
            item_id: item.item_id,
            item_code_snapshot: item.item_code,
            name_snapshot: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            qty_good: sourceItem?.qty_good !== undefined ? Number(sourceItem.qty_good) : item.quantity,
            qty_bad: sourceItem?.qty_bad !== undefined ? Number(sourceItem.qty_bad) : 0,
            qty_stained: sourceItem?.qty_stained !== undefined ? Number(sourceItem.qty_stained) : 0,
          });
        }

        updateData.subtotal = subtotal;
        updateData.vat_amount = vatAmount;
        updateData.total = total;
      }

      await OrderRepository.update(id, updateData, conn);

      await conn.commit();
      return await this.getOrderById(id);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async updateStatus(orderId: string, status: OrderStatus, userId: string, role: string, note?: string, specialNotes?: string) {
    const order = await OrderRepository.findById(orderId);
    if (!order) throw new AppError("Order not found", 404);

    // Block if BOTH invoiced AND completed
    if (order.is_invoiced && order.status === OrderStatus.COMPLETED) {
      throw new AppError("Cannot change status of an order that is already invoiced and completed.", 403);
    }

    // ── Rollback detection ────────────────────────────────────────────────────
    // A rollback occurs when both the current and target statuses are within the
    // processing pipeline AND the target index is earlier than the current index.
    const currentPipelineIdx = PROCESSING_PIPELINE.indexOf(order.status as OrderStatus);
    const targetPipelineIdx  = PROCESSING_PIPELINE.indexOf(status);
    const isRollback =
      currentPipelineIdx !== -1 &&
      targetPipelineIdx  !== -1 &&
      targetPipelineIdx  < currentPipelineIdx;

    if (isRollback) {
      // Only admin and staff can roll back processing stages
      if (role !== "admin" && role !== "staff") {
        throw new AppError("Only admin or staff can roll back processing stages.", 403);
      }
      // Invoiced orders cannot be rolled back under any circumstance
      if (order.is_invoiced) {
        throw new AppError("Cannot roll back a processing step on an invoiced order.", 403);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const STAFF_ONLY_STATUSES = new Set([
      OrderStatus.WASHING,
      OrderStatus.DRYING,
      OrderStatus.IRONING,
      OrderStatus.QUALITY_CHECK,
      OrderStatus.READY_TO_DELIVERY,
    ]);

    if (STAFF_ONLY_STATUSES.has(status) && role !== "staff" && role !== "admin" && role !== "operator") {
      throw new Error(`Only staff or operator can set order status to ${status}`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // If this is a rollback, release the machine currently assigned to the order
      // before changing the status. This runs inside the transaction.
      if (isRollback) {
        await MachineRepository.releaseOrderByOrderId(orderId, conn);
      }

      const updateData: Partial<IOrderMySQL> = { status };
      if (specialNotes && specialNotes.trim()) {
        const stageTag = status === OrderStatus.READY_TO_DELIVERY ? "quality_check" : status.toLowerCase();
        const updatedNotes = appendNote(order.special_notes, specialNotes, stageTag);
        if (updatedNotes !== (order.special_notes ?? null)) {
          updateData.special_notes = updatedNotes;
        }
      }

      await OrderRepository.update(orderId, updateData, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status,
        note: note || `Status updated to ${status}`,
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      if (!isRollback) {
        this.notifyClientOfStatus(orderId, status);
      }

      // Automatic Invoicing if status is COMPLETED
      if (status === OrderStatus.COMPLETED) {
        InvoiceService.createAutomaticInvoice(orderId, userId).catch(err => {
          console.error(`Error generating automatic invoice for order ${orderId}:`, err);
        });
      }

      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async confirmPickup(orderId: string, data: any, userId: string, role: string) {
    if (role !== "driver" && role !== "admin" && role !== "staff") {
      throw new Error("Only drivers, staff or admin can confirm pickups");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const order = await OrderRepository.findById(orderId);
      const incomingNote = data.special_notes;
      const updatedNotes = appendNote(order?.special_notes, incomingNote, "transit");

      const updateData: Partial<IOrderMySQL> = {
        actual_bags: data.actual_bags,
        status: OrderStatus.TRANSIT,
        ...(role === "driver" ? { driver_id: userId } : {}),
      };

      if (updatedNotes !== (order?.special_notes ?? null)) {
        updateData.special_notes = updatedNotes;
      }

      await OrderRepository.update(orderId, updateData, conn);

      if (data.photos && Array.isArray(data.photos)) {
        for (const photo of data.photos) {
          await conn.execute(
            "INSERT INTO order_photos (order_id, photo_url, type) VALUES (?, ?, 'before')",
            [orderId, photo.url]
          );
        }
      }

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.TRANSIT,
        note: "Pickup confirmed",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.TRANSIT);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async receiveAtFacility(orderId: string, data: any, userId: string, role: string) {
    if (role !== "staff" && role !== "admin" && role !== "operator") {
      throw new Error("Only staff or operator can receive orders at facility");
    }

    // Si el staff envía items, usamos la lógica de recepción completa que recalcula todo
    if (data.items && Array.isArray(data.items)) {
      return this.receiveInPlant(orderId, userId, {
        staff_confirmed_bags: data.staff_confirmed_bags || data.actual_bags || 1,
        special_notes: data.special_notes,
        items: data.items,
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await MachineRepository.releaseOrderByOrderId(orderId, conn);

      const order = await OrderRepository.findById(orderId);
      const incomingNote = data.special_notes;
      const updatedNotes = appendNote(order?.special_notes, incomingNote, "arrived");

      const updateData: Partial<IOrderMySQL> = {
        status: OrderStatus.ARRIVED,
      };

      if (updatedNotes !== (order?.special_notes ?? null)) {
        updateData.special_notes = updatedNotes;
      }

      await OrderRepository.update(orderId, updateData, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.ARRIVED,
        note: "Received at facility (Status update only)",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.ARRIVED);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async confirmCollection(orderId: string, userId: string, role: string) {
    if (role !== "driver" && role !== "admin" && role !== "staff") {
      throw new Error("Only drivers, staff or admin can confirm collection from facility");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await OrderRepository.update(orderId, { status: OrderStatus.COLLECTED }, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.COLLECTED,
        note: "Collected from facility for delivery",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.COLLECTED);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async confirmDriverAction(orderId: string, userId: string, role: string, data: any) {
    const order = await OrderRepository.findById(orderId);
    if (!order) throw new AppError("Order not found", 404);

    // Permission check: if not admin, must be the assigned driver
    if (role === "driver" && order.driver_id !== userId) {
      throw new AppError("Forbidden: You are not the assigned driver for this order.", 403);
    }

    // Determine action based on current status
    if (order.status === OrderStatus.ASSIGNED) {
      // Driver is starting to collect (pickup)
      return this.confirmPickup(orderId, data, userId, role);
    }

    if (order.status === OrderStatus.READY_TO_DELIVERY || order.status === OrderStatus.COLLECTED) {
      // Driver is delivering to client
      return this.confirmDelivery(orderId, data, userId, role);
    }

    throw new AppError(`Current order status (${order.status}) does not allow driver confirmation action.`, 400);
  }

  static async confirmDelivery(orderId: string, data: any, userId: string, role: string) {
    if (role !== "driver" && role !== "admin" && role !== "staff") {
      throw new Error("Only drivers, staff or admin can confirm delivery");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const incomingDeliveryNote = data.special_notes;
      if (incomingDeliveryNote) {
        const order = await OrderRepository.findById(orderId);
        const updatedNotes = appendNote(order?.special_notes, incomingDeliveryNote, "delivered");
        if (updatedNotes !== (order?.special_notes ?? null)) {
          await OrderRepository.update(orderId, { special_notes: updatedNotes }, conn);
        }
      }

      await OrderRepository.update(orderId, { status: OrderStatus.DELIVERED }, conn);

      if (data.photos && Array.isArray(data.photos)) {
        for (const photo of data.photos) {
          await conn.execute(
            "INSERT INTO order_photos (order_id, photo_url, type) VALUES (?, ?, 'after')",
            [orderId, photo.url]
          );
        }
      }

      const receivedByStr = data.received_by ? ` (Received by: ${data.received_by})` : "";
      const pkgStr = data.packages_delivered ? ` - ${data.packages_delivered} package(s)` : "";

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.DELIVERED,
        note: `Delivery confirmed${pkgStr}${receivedByStr}`,
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.DELIVERED);

      // Automatic Invoicing
      InvoiceService.createAutomaticInvoice(orderId, userId).catch(err => {
        console.error(`Error generating automatic invoice for order ${orderId}:`, err);
      });

      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async rescheduleOrder(orderId: string, data: any, userId: string, role?: string) {
    if (data.pickup_date && isDateInPast(data.pickup_date)) {
      throw new AppError("The pickup date cannot be in the past.", 400);
    }

    const order = await OrderRepository.findById(orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (role === "client" && String(order.client_id) !== String(userId)) {
      throw new AppError("Forbidden: You do not have permission to reschedule this order.", 403);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const updateData: Partial<IOrderMySQL> = {
        pickup_date: new Date(data.pickup_date),
        pickup_window_start: new Date(data.pickup_window.start_time),
        pickup_window_end: new Date(data.pickup_window.end_time),
      };

      if (order.status === OrderStatus.ASSIGNED) {
        updateData.status = OrderStatus.PENDING;
        updateData.driver_id = null;
        await conn.execute("DELETE FROM route_orders WHERE order_id = ?", [orderId]);
      }

      await OrderRepository.update(orderId, updateData, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: updateData.status || order?.status || OrderStatus.PENDING,
        note: "Rescheduled",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, updateData.status || order?.status || OrderStatus.PENDING);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async reassignOrder(
    orderId: string,
    targetDriverId: string,
    userId: string,
    role: string,
    routeDateInput?: string,
    areaInput?: string,
  ) {
    if (role !== "admin" && role !== "staff") {
      throw new Error("Only administrators and staff can reassign orders");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [drivers]: any = await conn.execute(
        "SELECT id FROM users WHERE id = ? AND is_active = 1",
        [targetDriverId]
      );
      if (drivers.length === 0) throw new Error("Driver not found or inactive");

      const order = await OrderRepository.findById(orderId);
      if (!order) throw new Error("Order not found");

      await conn.execute(
        "DELETE ro FROM route_orders ro INNER JOIN routes r ON ro.route_id = r.id WHERE ro.order_id = ? AND r.status != 'completed'",
        [orderId]
      );

      const pickupDate = new Date(order.pickup_date).toISOString().slice(0, 10);
      const routeDate = routeDateInput ? String(routeDateInput).slice(0, 10) : pickupDate;
      const area = areaInput || order.property_name || "General";

      const [routes]: any = await conn.execute(
        "SELECT id FROM routes WHERE driver_id = ? AND route_date = ? AND status = 'planned' LIMIT 1",
        [targetDriverId, routeDate]
      );

      let routeId: string;
      if (routes.length > 0) {
        routeId = routes[0].id;
      } else {
        const [generated]: any = await conn.query("SELECT UUID() AS id");
        routeId = generated[0].id;
        await conn.execute(
          "INSERT INTO routes (id, route_date, driver_id, area, status) VALUES (?, ?, ?, ?, 'planned')",
          [routeId, routeDate, targetDriverId, area]
        );
      }

      await conn.execute(
        "INSERT INTO route_orders (route_id, order_id) VALUES (?, ?)",
        [routeId, orderId]
      );

      // Keep current status for any post-pending flow to avoid regressions (e.g. ReadyToDeliver -> Assigned).
      // This normalization tolerates snake_case, camelCase and spacing variants.
      const statusRaw = String(order.status || "").trim();
      const statusCanonical = statusRaw
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase();

      const shouldMoveToAssigned = statusCanonical === "pending";
      const newStatus = shouldMoveToAssigned ? OrderStatus.ASSIGNED : order.status;

      await OrderRepository.update(
        orderId,
        shouldMoveToAssigned
          ? { status: newStatus, driver_id: targetDriverId }
          : { driver_id: targetDriverId },
        conn,
      );

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: shouldMoveToAssigned ? OrderStatus.ASSIGNED : statusCanonical,
        note: `Reassigned to driver ${targetDriverId}`,
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      // Only notify if status changed
      if (shouldMoveToAssigned) {
        this.notifyClientOfStatus(orderId, newStatus);
      }
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Dispatcher unificado para PATCH /api/orders/:id/status
   *
   * Valida permisos por rol según el status destino y delega
   * a la operación especializada correspondiente.
   *
   * Permisos por status:
   *   transit            → driver, admin       (+ actual_bags, photos, notes)
   *   arrived            → staff, admin        (+ internal_notes)
   *   washing/drying/
   *   ironing/quality_check/
   *   ready_to_delivery  → staff, admin
   *   collected          → driver, admin
   *   delivered          → driver, admin       (+ photos, notes)
   *   assigned/pending/
   *   cancelled/invoiced/
   *   completed          → admin, staff
   */
  static async advanceStatus(
    orderId: string,
    status: OrderStatus,
    payload: {
      actual_bags?: number;
      photos?: { url: string }[];
      internal_notes?: string;
      special_notes?: string;
      staff_confirmed_bags?: number;
      items?: any[];
      note?: string;
    },
    userId: string,
    role: string
  ) {
    switch (status) {
      case OrderStatus.TRANSIT:
        return this.confirmPickup(orderId, payload, userId, role);

      case OrderStatus.ARRIVED: {
        // If items are provided (Reception screen intake), use receiveAtFacility.
        // If this is a rollback from a stage within the processing pipeline (washing, drying, etc.),
        // route to updateStatus so rollback rules, validation, and machine release execute properly.
        if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
          const order = await OrderRepository.findById(orderId);
          if (order) {
            const currentPipelineIdx = PROCESSING_PIPELINE.indexOf(order.status as OrderStatus);
            const targetPipelineIdx  = PROCESSING_PIPELINE.indexOf(status);
            if (currentPipelineIdx !== -1 && targetPipelineIdx !== -1 && targetPipelineIdx < currentPipelineIdx) {
              return this.updateStatus(orderId, status, userId, role, payload.note, payload.special_notes);
            }
          }
        }
        return this.receiveAtFacility(orderId, payload, userId, role);
      }

      case OrderStatus.COLLECTED:
        return this.confirmCollection(orderId, userId, role);

      case OrderStatus.DELIVERED:
        return this.confirmDelivery(orderId, payload, userId, role);

      default:
        // Covers: pending, washing, drying, ironing, quality_check,
        //         ready_to_delivery, assigned, cancelled, completed
        return this.updateStatus(orderId, status, userId, role, payload.note, payload.special_notes);
    }
  }

  static async deleteOrder(id: string, userId: string, role: string, parentClientId?: string | null) {
    const order = await OrderRepository.findById(id);
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const effectiveClientId = parentClientId ?? userId;
    const isClientContext = role === "client" || !!parentClientId;

    if (role !== "admin" && role !== "staff") {
      if (isClientContext && String(order.client_id) !== String(effectiveClientId)) {
        throw new AppError("Forbidden: You can only cancel orders belonging to your client account.", 403);
      }
    }

    if (order.is_invoiced) {
      throw new AppError("Cannot cancel an order that has already been invoiced.", 400);
    }

    const statusRaw = String(order.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (statusRaw === OrderStatus.CANCELLED || statusRaw === "cancelled") {
      throw new AppError("Order is already cancelled.", 400);
    }

    if (statusRaw === OrderStatus.COMPLETED || statusRaw === "completed") {
      throw new AppError("Cannot cancel a completed order.", 400);
    }

    const ALLOWED_CANCEL_STATUSES = new Set([
      OrderStatus.PENDING,
      OrderStatus.ASSIGNED,
      "pending",
      "assigned",
    ]);

    if (!ALLOWED_CANCEL_STATUSES.has(statusRaw as any)) {
      throw new AppError(
        `Cannot cancel order in status '${order.status}'. Only pending or assigned orders can be cancelled.`,
        400
      );
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await OrderRepository.update(id, { status: OrderStatus.CANCELLED, driver_id: null }, conn);

      await conn.execute("DELETE FROM route_orders WHERE order_id = ?", [id]);

      await MachineRepository.releaseOrderByOrderId(id, conn);

      await OrderRepository.insertHistory(conn, {
        order_id: id,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.CANCELLED,
        note: role === "admin" ? "Order cancelled by admin" : "Order cancelled by client",
      });

      await conn.commit();
      return await this.getOrderById(id);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

