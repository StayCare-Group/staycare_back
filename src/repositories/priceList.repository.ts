import { PoolConnection } from "mysql2/promise";
import pool from "../db/pool";

export class PriceListRepository {
  
  static async upsertItem(clientId: string, itemId: string, price: number, connection?: PoolConnection) {
    const db = connection || pool;
    const query = `
      INSERT INTO client_custom_prices (client_id, item_id, price) 
      VALUES (?, ?, ?) 
      ON DUPLICATE KEY UPDATE price = VALUES(price)
    `;
    await db.execute(query, [clientId, itemId, price]);
  }

  static async deleteItem(clientId: string, itemId: string, connection?: PoolConnection) {
    const db = connection || pool;
    await db.execute("DELETE FROM client_custom_prices WHERE client_id = ? AND item_id = ?", [clientId, itemId]);
  }

  static async deleteItemsByClientId(clientId: string, connection?: PoolConnection) {
    const db = connection || pool;
    await db.execute("DELETE FROM client_custom_prices WHERE client_id = ?", [clientId]);
  }

  static async findItemsByClientId(clientId: string, connection?: PoolConnection) {
    const db = connection || pool;
    const query = `
      SELECT ccp.item_id, ccp.price, ccp.updated_at, i.name AS item_name
      FROM client_custom_prices ccp
      JOIN items i ON ccp.item_id = i.id
      WHERE ccp.client_id = ?
    `;
    const [rows]: any = await db.execute(query, [clientId]);
    return rows;
  }

  static async findItemByClientAndItemId(clientId: string, itemId: string, connection?: PoolConnection) {
    const db = connection || pool;
    const [rows]: any = await db.execute("SELECT * FROM client_custom_prices WHERE client_id = ? AND item_id = ?", [clientId, itemId]);
    return rows[0] || null;
  }
}
