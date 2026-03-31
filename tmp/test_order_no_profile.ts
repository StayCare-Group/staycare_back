import { OrderService } from "../src/services/order.service";
import pool from "../src/db/pool";

async function testNoProfileOrder() {
  try {
    const userId = 13; // The user without a profile
    const orderData = {
      service_type: "standard",
      pickup_date: "2026-04-01",
      pickup_window: {
        start_time: "2026-04-01T10:00:00.000Z",
        end_time: "2026-04-01T12:00:00.000Z"
      },
      estimated_bags: 2,
      items: [{ item_id: 12, quantity: 10 }] // Ensure item exists
    };

    console.log("Creating order for user 13 (no profile)...");
    const order = await OrderService.createOrder(orderData, userId, "client");
    console.log("SUCCESS: Order created successfully:", order?.order_number);
    console.log("Client Name from DB:", order?.client_name);

    if (order?.client_name !== "No Profile User") {
        throw new Error("Client name mismatch. Expected 'No Profile User' but got: " + order?.client_name);
    }

    process.exit(0);
  } catch (e) {
    console.error("FAILED:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testNoProfileOrder();
