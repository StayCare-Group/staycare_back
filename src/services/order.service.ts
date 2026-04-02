import pool from "../db/pool";
import { OrderRepository, IOrderMySQL } from "../repositories/order.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { ItemRepository } from "../repositories/item.repository";
import { OrderStatus } from "../types/orderStatus";
import { sendOrderStatusEmail } from "../utils/mail";
import { PoolConnection } from "mysql2/promise";
import { AppError } from "../utils/AppError";

const EXPRESS_SURCHARGE = 25.0;

export class OrderService {
  private static async notifyClientOfStatus(orderId: number, newStatus: OrderStatus): Promise<void> {
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

  static async getAllOrders(filter: any, limit: number, offset: number) {
    const [orders, total] = await Promise.all([
      OrderRepository.findManyFiltered(filter, limit, offset),
      OrderRepository.countFiltered(filter),
    ]);
    return { orders, total };
  }

  static async getOrderById(id: number | string) {
    const order = await OrderRepository.findById(id);
    if (!order) return null;
    const items = await OrderRepository.findItemsByOrderId(id);
    const history = await OrderRepository.findHistoryByOrderId(id);
    return { ...order, items, status_history: history };
  }

  static async createOrder(data: any, userId: number, role: string) {
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
        // Verify user exists
        const [user]: any = await pool.execute("SELECT id FROM users WHERE id = ?", [clientId]);
        if (user.length === 0) {
          throw new Error(`Client (User) with ID ${clientId} not found.`);
        }
      }

      const orderNumber = this.generateOrderNumber();
      
      // Calculate pricing based on items
      let subtotal = 0;
      const vatPercentage = 18;
      const calculatedItems: any[] = [];

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const itemDef = await ItemRepository.findById(item.item_id);
          if (!itemDef) {
            throw new Error(`Item with ID ${item.item_id} not found.`);
          }
          const unitPrice = itemDef.base_price;
          const totalPrice = unitPrice * item.quantity;
          subtotal += totalPrice;
          
          calculatedItems.push({
            item_id: item.item_id,
            item_code: itemDef.item_code,
            name: itemDef.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: totalPrice
          });
        }
      }

      const vatAmount = parseFloat((subtotal * (vatPercentage / 100)).toFixed(2));
      const surcharge = (data.service_type === "express") ? EXPRESS_SURCHARGE : 0;
      const total = parseFloat((subtotal + vatAmount + surcharge).toFixed(2));

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
        special_notes: data.special_notes || null,
        status: OrderStatus.PENDING,
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
          qty_good: 0,
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
    orderId: number, 
    userId: number, 
    data: { 
      staff_confirmed_bags: number; 
      items: { item_id: number; quantity: number; qty_good: number; qty_bad: number; qty_stained: number }[] 
    }
  ) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const order = await OrderRepository.findById(orderId);
      if (!order) throw new Error("Order not found");

      // 1. Clear existing items
      await OrderRepository.deleteItemsByOrderId(conn, orderId);

      // 2. Re-calculate financials based on staff-provided items
      let subtotal = 0;
      const vatPercentage = 18;
      
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const itemDef = await ItemRepository.findById(item.item_id);
          if (!itemDef) {
            throw new Error(`Item with ID ${item.item_id} not found during staff reception.`);
          }
          const unitPrice = itemDef.base_price;
          const totalPrice = unitPrice * item.quantity;
          subtotal += totalPrice;

          await OrderRepository.insertItem(conn, {
            order_id: orderId,
            item_id: item.item_id,
            item_code_snapshot: itemDef.item_code,
            name_snapshot: itemDef.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: totalPrice,
            qty_good: item.qty_good || 0,
            qty_bad: item.qty_bad || 0,
            qty_stained: item.qty_stained || 0,
          });
        }
      }

      const vatAmount = parseFloat((subtotal * (vatPercentage / 100)).toFixed(2));
      const surcharge = (order.service_type === "express") ? EXPRESS_SURCHARGE : 0;
      const total = parseFloat((subtotal + vatAmount + surcharge).toFixed(2));

      // 3. Update order status, confirmed bags, and financials
      await OrderRepository.update(orderId, {
        status: OrderStatus.ARRIVED,
        staff_confirmed_bags: data.staff_confirmed_bags,
        subtotal,
        vat_amount: vatAmount,
        total,
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

  static async updateOrder(id: number, data: any, userId: number) {
    await OrderRepository.update(id, data);
    return await this.getOrderById(id);
  }

  static async updateStatus(orderId: number, status: OrderStatus, userId: number, role: string, note?: string) {
    const STAFF_ONLY_STATUSES = new Set([
      OrderStatus.WASHING,
      OrderStatus.DRYING,
      OrderStatus.IRONING,
      OrderStatus.QUALITY_CHECK,
      OrderStatus.READY_TO_DELIVERY,
    ]);

    if (STAFF_ONLY_STATUSES.has(status) && role !== "staff" && role !== "admin") {
      throw new Error(`Only staff can set order status to ${status}`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await OrderRepository.update(orderId, { status }, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status,
        note: note || `Status updated to ${status}`,
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, status);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async confirmPickup(orderId: number, data: any, userId: number, role: string) {
    if (role !== "driver" && role !== "admin") {
      throw new Error("Only drivers can confirm pickups");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const updateData: Partial<IOrderMySQL> = {
        actual_bags: data.actual_bags,
        status: OrderStatus.TRANSIT,
        driver_id: userId,
      };
      
      if (data.notes) {
        updateData.special_notes = data.notes;
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

  static async receiveAtFacility(orderId: number, data: any, userId: number, role: string) {
    if (role !== "staff" && role !== "admin") {
      throw new Error("Only staff can receive orders at facility");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const updateData: Partial<IOrderMySQL> = {
        status: OrderStatus.ARRIVED,
      };

      if (data.internal_notes) {
        const order = await OrderRepository.findById(orderId);
        updateData.special_notes = [order?.special_notes, data.internal_notes].filter(Boolean).join(" | ");
      }

      await OrderRepository.update(orderId, updateData, conn);
      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.ARRIVED,
        note: "Received at facility",
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

  static async confirmCollection(orderId: number, userId: number, role: string) {
    if (role !== "driver" && role !== "admin") {
      throw new Error("Only drivers can confirm collection from facility");
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

  static async confirmDriverAction(orderId: number, userId: number, role: string, data: any) {
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

  static async confirmDelivery(orderId: number, data: any, userId: number, role: string) {
    if (role !== "driver" && role !== "admin") {
      throw new Error("Only drivers can confirm delivery");
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await OrderRepository.update(orderId, { status: OrderStatus.DELIVERED }, conn);

      if (data.photos && Array.isArray(data.photos)) {
        for (const photo of data.photos) {
          await conn.execute(
            "INSERT INTO order_photos (order_id, photo_url, type) VALUES (?, ?, 'after')",
            [orderId, photo.url]
          );
        }
      }

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.DELIVERED,
        note: "Delivery confirmed",
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.DELIVERED);
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async rescheduleOrder(orderId: number, data: any, userId: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const updateData: Partial<IOrderMySQL> = {
        pickup_date: new Date(data.pickup_date),
        pickup_window_start: new Date(data.pickup_window.start_time),
        pickup_window_end: new Date(data.pickup_window.end_time),
      };

      const order = await OrderRepository.findById(orderId);
      if (order?.status === OrderStatus.ASSIGNED) {
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

  static async reassignOrder(orderId: number, targetDriverId: number, userId: number, role: string) {
    if (role !== "admin") {
      throw new Error("Only administrators can reassign orders");
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
      const area = order.property_name || "General";

      const [routes]: any = await conn.execute(
        "SELECT id FROM routes WHERE driver_id = ? AND route_date = ? AND status = 'planned' LIMIT 1",
        [targetDriverId, pickupDate]
      );

      let routeId: number;
      if (routes.length > 0) {
        routeId = routes[0].id;
      } else {
        const [result]: any = await conn.execute(
          "INSERT INTO routes (route_date, driver_id, area, status) VALUES (?, ?, ?, 'planned')",
          [pickupDate, targetDriverId, area]
        );
        routeId = result.insertId;
      }

      await conn.execute(
        "INSERT INTO route_orders (route_id, order_id) VALUES (?, ?)",
        [routeId, orderId]
      );

      await OrderRepository.update(orderId, {
        status: OrderStatus.ASSIGNED,
        driver_id: targetDriverId,
      }, conn);

      await OrderRepository.insertHistory(conn, {
        order_id: orderId,
        changed_by_user_id: userId,
        is_system: false,
        status: OrderStatus.ASSIGNED,
        note: `Reassigned to driver ${targetDriverId}`,
      });

      await conn.commit();
      const result = await this.getOrderById(orderId);
      this.notifyClientOfStatus(orderId, OrderStatus.ASSIGNED);
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
    orderId: number,
    status: OrderStatus,
    payload: {
      actual_bags?: number;
      photos?: { url: string }[];
      notes?: string;
      internal_notes?: string;
      note?: string;
    },
    userId: number,
    role: string
  ) {
    switch (status) {
      case OrderStatus.TRANSIT:
        return this.confirmPickup(orderId, payload, userId, role);

      case OrderStatus.ARRIVED:
        return this.receiveAtFacility(orderId, payload, userId, role);

      case OrderStatus.COLLECTED:
        return this.confirmCollection(orderId, userId, role);

      case OrderStatus.DELIVERED:
        return this.confirmDelivery(orderId, payload, userId, role);

      default:
        // Covers: pending, washing, drying, ironing, quality_check,
        //         ready_to_delivery, assigned, cancelled, invoiced, completed
        return this.updateStatus(orderId, status, userId, role, payload.note ?? payload.notes);
    }
  }

  static async deleteOrder(id: number) {
    await OrderRepository.delete(id);
  }
}
