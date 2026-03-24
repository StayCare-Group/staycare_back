    import User from "../models/User";
import Route from "../models/Routes";
import Order from "../models/Orders";
import type { IOrders } from "../models/Orders";
import Client from "../models/Clients";
import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function dayWindow(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

async function getAreaFromOrder(order: IOrders): Promise<string> {
  if (!order.client || !order.property) return "General";
  const client = await Client.findById(order.client);
  if (!client) return "General";
  const prop = (client.properties as any[]).find(
    (p) => p._id.toString() === order.property.toString()
  );
  return prop?.area ?? "General";
}

// ─────────────────────────────────────────────────────────────────────────────
// autoAssignRoute
// Picks the active driver with the fewest orders on the pickup date (round-robin),
// then adds the order to that driver's planned route for the day,
// creating a new route when none exists yet.
// ─────────────────────────────────────────────────────────────────────────────
export async function autoAssignRoute(order: IOrders): Promise<void> {
  const drivers = await User.find({ role: "driver", is_active: true }).select("_id");
  if (!drivers.length) return;

  const { from: pickupFrom, to: pickupTo } = dayWindow(order.pickup_date);
  const driverIds = drivers.map((d) => d._id);

  const existingRoutes = await (Route as any).find({
    route_date: { $gte: pickupFrom, $lt: pickupTo },
    driver: { $in: driverIds },
    status: { $ne: "completed" },
  }).select("driver orders");

  // Build order-count map (initialise all drivers to 0)
  const orderCount = new Map<string, number>();
  for (const d of drivers) orderCount.set(d._id.toString(), 0);
  for (const r of existingRoutes) {
    const k = r.driver.toString();
    orderCount.set(k, (orderCount.get(k) ?? 0) + r.orders.length);
  }

  // Select driver with fewest orders (round-robin)
  let selectedDriverId = "";
  let min = Infinity;
  for (const [id, count] of orderCount.entries()) {
    if (count < min) { min = count; selectedDriverId = id; }
  }
  if (!selectedDriverId) return;

  const area = await getAreaFromOrder(order);
  const driverOid = new mongoose.Types.ObjectId(selectedDriverId);

  // Find or create the driver's planned route for this day
  let route = await (Route as any).findOne({
    driver: driverOid,
    route_date: { $gte: pickupFrom, $lt: pickupTo },
    status: "planned",
  });

  if (route) {
    (route.orders as any[]).push(order._id);
    await route.save();
  } else {
    route = await Route.create({
      route_date: pickupFrom,
      driver: driverOid,
      area,
      orders: [order._id],
      status: "planned",
    } as any);
  }

  // Mark order as Assigned
  await Order.findByIdAndUpdate(order._id, {
    status: "Assigned",
    deliver_id: driverOid,
    updated_at: new Date(),
    $push: {
      status_history: {
        status: "Assigned",
        changed_by: "system",
        timestamp: new Date(),
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// reassignOrderToDriver
// Admin override: move an order to a specific driver.
// Removes the order from any current route and adds it to the target
// driver's planned route for the same pickup date.
// ─────────────────────────────────────────────────────────────────────────────
export async function reassignOrderToDriver(
  orderId: string,
  targetDriverId: string,
  changedBy: string
): Promise<void> {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");

  const driver = await User.findOne({ _id: targetDriverId, role: "driver", is_active: true });
  if (!driver) throw new Error("Driver not found or inactive");

  const { from: pickupFrom, to: pickupTo } = dayWindow(order.pickup_date);
  const driverOid = new mongoose.Types.ObjectId(targetDriverId);

  // Remove from any existing route
  await (Route as any).updateMany(
    { orders: order._id, status: { $ne: "completed" } },
    { $pull: { orders: order._id } }
  );

  const area = await getAreaFromOrder(order);

  // Find or create target driver's planned route for the day
  let route = await (Route as any).findOne({
    driver: driverOid,
    route_date: { $gte: pickupFrom, $lt: pickupTo },
    status: "planned",
  });

  if (route) {
    (route.orders as any[]).push(order._id);
    await route.save();
  } else {
    route = await Route.create({
      route_date: pickupFrom,
      driver: driverOid,
      area,
      orders: [order._id],
      status: "planned",
    } as any);
  }

  // Update order
  await Order.findByIdAndUpdate(orderId, {
    status: "Assigned",
    deliver_id: driverOid,
    updated_at: new Date(),
    $push: {
      status_history: {
        status: "Assigned",
        changed_by: changedBy,
        timestamp: new Date(),
      },
    },
  });
}
