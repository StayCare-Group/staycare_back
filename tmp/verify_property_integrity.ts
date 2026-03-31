import { PropertyService } from "../src/services/property.service";
import { OrderService } from "../src/services/order.service";
import pool from "../src/db/pool";

async function verifyPropertyIntegrity() {
  try {
    console.log("--- INICIANDO VERIFICACIÓN DE INTEGRIDAD DE PROPIEDADES ---");
    
    const userId = 13; // Usuario creado anteriormente
    const propertyData = {
      property_name: "Sede de Prueba Integridad",
      address: "Calle Falsa 123",
      city: "Springfield",
      area: "Centro",
    };

    console.log("1. Creando sede...");
    const prop = await PropertyService.addPropertyForClientUser(userId, propertyData);
    const propId = prop!.id!;
    console.log("Sede creada ID:", propId);

    console.log("2. Creando orden asociada a la sede...");
    const orderData = {
      service_type: "standard",
      pickup_date: "2026-04-01",
      property_id: propId,
      pickup_window: {
        start_time: "2026-04-01T10:00:00.000Z",
        end_time: "2026-04-01T12:00:00.000Z"
      },
      items: [{ item_id: 12, quantity: 1 }]
    };
    const order = (await OrderService.createOrder(orderData, userId, "client")) as any;
    console.log("Orden creada:", order.order_number);

    console.log("3. Intentando eliminar la sede (debe fallar)...");
    try {
      await PropertyService.deleteProperty(propId, userId);
      console.error("ERROR: La sede se eliminó a pesar de tener una orden asociada.");
      process.exit(1);
    } catch (e: any) {
      console.log("ÉXITO: La eliminación fue bloqueada correctamente:", e.message);
    }

    console.log("4. Eliminando la orden...");
    if (order) {
        await pool.execute("DELETE FROM order_items WHERE order_id = ?", [order.id]);
        await pool.execute("DELETE FROM order_status_history WHERE order_id = ?", [order.id]);
        await pool.execute("DELETE FROM orders WHERE id = ?", [order.id]);
        console.log("Orden eliminada.");
    }

    console.log("5. Intentando eliminar la sede nuevamente (debe funcionar)...");
    await PropertyService.deleteProperty(propId, userId);
    console.log("ÉXITO: La sede fue eliminada correctamente.");

    process.exit(0);
  } catch (e) {
    console.error("error inesperado:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyPropertyIntegrity();
