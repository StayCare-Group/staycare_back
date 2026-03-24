import { Request, Response } from "express";
import Order from "../models/Orders";
import Invoice from "../models/Invoices";
import User from "../models/User";
import Client from "../models/Clients";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";
import { autoAssignRoute, reassignOrderToDriver } from "../utils/autoAssignRoute";
import { sendOrderStatusEmail } from "../utils/mail";

const NOTIFY_STATUSES = new Set([
  "Assigned", "Transit", "Arrived", "ReadyToDeliver", "Delivered", "Completed",
]);

async function notifyClientOfStatus(orderId: string, newStatus: string): Promise<void> {
  if (!NOTIFY_STATUSES.has(newStatus)) return;
  try {
    const order = await Order.findById(orderId).select("order_number client");
    if (!order) return;
    const client = await Client.findById(order.client).select("email contact_person");
    if (!client?.email) return;
    await sendOrderStatusEmail(client.email, order.order_number, newStatus, client.contact_person);
  } catch { /* best-effort */ }
}

const generateOrderNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${y}${m}${d}-${rand}`;
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const orderData: Record<string, any> = {
      ...req.body,
      order_number: generateOrderNumber(),
      status: "Pending",
      status_history: [
        {
          status: "Pending",
          changed_by: req.user!.userId,
          timestamp: new Date(),
        },
      ],
    };

    if (!orderData.pricing_snapshot) {
      orderData.pricing_snapshot = {
        subtotal: 0,
        vat_percentage: 18,
        vat_amount: 0,
        total: 0,
      };
    }

    // Order.client must be the Clients document id (ref "Clients"), not the User id.
    if (req.user!.role === "client") {
      const user = await User.findById(req.user!.userId).select("client");
      if (!user?.client) {
        return sendError(res, 400, "Your account has no linked client. Complete company setup first.");
      }
      orderData.client = user.client;
    } else {
      // admin / staff must supply a client id
      if (!orderData.client) {
        return sendError(res, 400, "client field is required when an admin creates an order");
      }
    }

    // If a property is specified, verify it belongs to the resolved client
    if (orderData.property && orderData.client) {
      const clientDoc = await Client.findById(orderData.client);
      if (!clientDoc) {
        return sendError(res, 404, "Client not found");
      }
      const wantedId = String(orderData.property).trim();
      const propertyBelongs = (clientDoc.properties as any[]).some(
        (p) => p._id && p._id.toString() === wantedId,
      );
      if (!propertyBelongs) {
        return sendError(
          res,
          400,
          "The specified property does not belong to this client. Use properties[]. _id from GET /api/clients/:id (same id as order client). Or omit property.",
        );
      }
    }

    const order = await Order.create(orderData);

    // Auto-assign the new order to a driver route (best-effort — never fails the request)
    try {
      await autoAssignRoute(order);
    } catch (_) {}

    // Re-fetch so the response reflects any status / deliver_id updates from assignment
    const updatedOrder = await Order.findById(order._id)
      .populate("deliver_id", "name email phone");

    return sendSuccess(res, 201, "Order created", updatedOrder ?? order);
  } catch (error) {
    return sendError(res, 400, "Order creation failed");
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { status, client, service_type, from, to } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (service_type) filter.service_type = service_type;

    if (req.user!.role === "client") {
      const user = await User.findById(req.user!.userId).select("client");
      if (user?.client) filter.client = user.client;
      else filter.client = null; // no linked client -> no orders
    } else if (client) {
      filter.client = client;
    }

    if (req.user!.role === "driver") {
      filter.deliver_id = req.user!.userId;
    }

    if (from || to) {
      filter.created_at = {};
      if (from) filter.created_at.$gte = new Date(from as string);
      if (to) filter.created_at.$lte = new Date(to as string);
    }

    const { page, limit, skip } = parsePagination(req);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("client", "company_name contact_person email properties billing_address")
        .populate("deliver_id", "name email")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Orders retrieved", orders, paginationMeta(total, page, limit));
  } catch (error) {
    return sendError(res, 400, "Failed to fetch orders");
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("client")
      .populate("deliver_id", "name email phone");

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (req.user!.role === "client") {
      const user = await User.findById(req.user!.userId).select("client");
      const orderClientId =
        (order.client as any)?._id?.toString() ?? (order.client as any)?.toString?.();
      const userClientId = user?.client?.toString?.();
      if (!userClientId || orderClientId !== userClientId) {
        return sendError(res, 403, "Forbidden");
      }
    }

    return sendSuccess(res, 200, "Order retrieved", order);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch order");
  }
};

export const updateOrder = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (
      !["Pending", "Assigned"].includes(order.status) &&
      req.user!.role !== "admin"
    ) {
      return sendError(res, 400, "Order can only be edited while Pending or Assigned");
    }

    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updated_at: new Date() },
      { new: true },
    );

    return sendSuccess(res, 200, "Order updated", updated);
  } catch (error) {
    return sendError(res, 400, "Order update failed");
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    order.status = status;
    order.status_history.push({
      status,
      changed_by: req.user!.userId,
      timestamp: new Date(),
    });
    order.updated_at = new Date();

    await order.save();
    notifyClientOfStatus(order._id.toString(), status);
    return sendSuccess(res, 200, "Order status updated", order);
  } catch (error) {
    return sendError(res, 400, "Status update failed");
  }
};

export const confirmPickup = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (!["Pending", "Assigned"].includes(order.status)) {
      return sendError(res, 400, "Order is not awaiting pickup");
    }

    order.actual_bags = req.body.actual_bags;

    if (req.body.photos) {
      for (const photo of req.body.photos) {
        order.photos.push({ ...photo, uploaded_at: new Date() });
      }
    }

    if (req.body.items) {
      order.items = req.body.items;
    }

    if (req.body.notes) {
      order.special_notes = [order.special_notes, req.body.notes]
        .filter(Boolean)
        .join(" | ");
    }

    order.deliver_id = req.user!.userId as any;
    order.status = "Transit";
    order.status_history.push({
      status: "Transit",
      changed_by: req.user!.userId,
      timestamp: new Date(),
    });
    order.updated_at = new Date();

    await order.save();
    notifyClientOfStatus(order._id.toString(), "Transit");
    return sendSuccess(res, 200, "Pickup confirmed", order);
  } catch (error) {
    return sendError(res, 400, "Pickup confirmation failed");
  }
};

export const receiveAtFacility = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (order.status !== "Transit") {
      return sendError(res, 400, "Order is not in transit");
    }

    if (req.body.items) {
      order.items = req.body.items;
    }

    if (req.body.internal_notes) {
      order.special_notes = [order.special_notes, req.body.internal_notes]
        .filter(Boolean)
        .join(" | ");
    }

    order.status = "Arrived";
    order.status_history.push({
      status: "Arrived",
      changed_by: req.user!.userId,
      timestamp: new Date(),
    });
    order.updated_at = new Date();

    await order.save();
    return sendSuccess(res, 200, "Order received at facility", order);
  } catch (error) {
    return sendError(res, 400, "Facility reception failed");
  }
};

export const confirmDelivery = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (!["ReadyToDeliver", "Collected"].includes(order.status)) {
      return sendError(res, 400, "Order is not ready for delivery");
    }

    if (req.body.photos) {
      for (const photo of req.body.photos) {
        order.photos.push({ ...photo, uploaded_at: new Date() });
      }
    }

    order.status = "Delivered";
    order.status_history.push({
      status: "Delivered",
      changed_by: req.user!.userId,
      timestamp: new Date(),
    });
    order.updated_at = new Date();

    await order.save();
    notifyClientOfStatus(order._id.toString(), "Delivered");

    // ── Auto-generate invoice ──────────────────────────────────
    try {
      const now = new Date();
      const y = now.getFullYear().toString().slice(-2);
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const rand = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${y}${m}-${rand}`;

      // Build line items from order items
      const lineItems = (order.items ?? []).map((item) => ({
        description: item.name,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        total_price: item.total_price ?? 0,
      }));

      // If order has no items, create a single line from the bag count
      if (lineItems.length === 0) {
        lineItems.push({
          description: `Laundry service – ${order.service_type} (${order.actual_bags ?? order.estimated_bags ?? 1} bags)`,
          quantity: order.actual_bags ?? order.estimated_bags ?? 1,
          unit_price:
            order.pricing_snapshot?.subtotal
              ? order.pricing_snapshot.subtotal / (order.actual_bags ?? order.estimated_bags ?? 1)
              : 0,
          total_price: order.pricing_snapshot?.subtotal ?? 0,
        });
      }

      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 14); // Net-14 payment terms

      const invoice = await Invoice.create({
        invoice_number: invoiceNumber,
        client: order.client,
        orders: [order._id] as any,
        issue_date: now,
        due_date: dueDate,
        line_items: lineItems,
        subtotal: order.pricing_snapshot?.subtotal ?? 0,
        vat_percentage: order.pricing_snapshot?.vat_percentage ?? 18,
        vat_amount: order.pricing_snapshot?.vat_amount ?? 0,
        total: order.pricing_snapshot?.total ?? 0,
        status: "pending",
      });

      // Move order to Invoiced
      order.status = "Invoiced";
      order.status_history.push({
        status: "Invoiced",
        changed_by: req.user!.userId,
        timestamp: new Date(),
      });
      order.updated_at = new Date();
      await order.save();

      return sendSuccess(res, 200, "Delivery confirmed & invoice created", {
        order,
        invoice,
      });
    } catch (invoiceErr) {
      // Invoice creation failed but delivery was already confirmed
      // Return success for the delivery but include a warning
      return sendSuccess(res, 200, "Delivery confirmed (invoice generation failed)", order);
    }
  } catch (error) {
    return sendError(res, 400, "Delivery confirmation failed");
  }
};

/**
 * Admin / staff only — move an order to a different driver.
 * Body: { driver_id: string }
 */
export const reassignOrder = async (req: Request, res: Response) => {
  try {
    const { driver_id } = req.body;
    if (!driver_id) return sendError(res, 400, "driver_id is required");

    const route = await reassignOrderToDriver(
      req.params.id as string,
      driver_id,
      req.user!.userId,
    );

    const order = await Order.findById(req.params.id).populate("deliver_id", "name email phone");
    return sendSuccess(res, 200, "Order reassigned", { order, route });
  } catch (error: any) {
    return sendError(res, 400, error?.message ?? "Reassignment failed");
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (order.status !== "Pending") {
      return sendError(res, 400, "Only pending orders can be deleted");
    }

    await order.deleteOne();
    return sendSuccess(res, 200, "Order deleted");
  } catch (error) {
    return sendError(res, 400, "Order deletion failed");
  }
};

export const rescheduleOrder = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    if (!['Pending', 'Assigned'].includes(order.status)) {
      return sendError(res, 400, "Only Pending or Assigned orders can be rescheduled");
    }

    // Clients can only reschedule their own orders
    if (req.user!.role === 'client') {
      const user = await User.findById(req.user!.userId).select('client');
      const orderClientId =
        (order.client as any)?._id?.toString() ?? (order.client as any)?.toString?.();
      if (!user?.client || user.client.toString() !== orderClientId) {
        return sendError(res, 403, 'Forbidden');
      }
    }

    const { pickup_date, pickup_window } = req.body;

    // Push a rescheduled note into status_history (keeps current status)
    order.status_history.push({
      status: order.status,
      changed_by: req.user!.userId,
      timestamp: new Date(),
      note: 'Rescheduled',
    } as any);

    // If the order was already assigned to a route, unassign it
    if (order.status === 'Assigned') {
      const Route = require('../models/Routes').default;
      await Route.updateMany(
        { orders: order._id, status: { $ne: 'completed' } },
        { $pull: { orders: order._id } },
      );
      order.status = 'Pending';
      order.deliver_id = undefined as any;
    }

    order.pickup_date = new Date(pickup_date);
    order.pickup_window = {
      start_time: new Date(pickup_window.start_time),
      end_time: new Date(pickup_window.end_time),
    };
    order.updated_at = new Date();

    await order.save();

    // Best-effort re-assign to a route for the new date
    try {
      await autoAssignRoute(order);
    } catch (_) {}

    const updated = await Order.findById(order._id).populate('deliver_id', 'name email phone');
    return sendSuccess(res, 200, 'Order rescheduled', updated ?? order);
  } catch (error) {
    return sendError(res, 400, 'Reschedule failed');
  }
};
