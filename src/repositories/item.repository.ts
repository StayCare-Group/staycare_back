import pool from "../db/pool";
import type { RowDataPacket } from "mysql2";
import { generateEntityId, type EntityId } from "../utils/id";

export interface IItemRow extends RowDataPacket {
  id: EntityId;
  item_code: string;
  name: string;
  base_price: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ItemInsertInput {
  item_code: string;
  name: string;
  base_price: number;
}

export class ItemRepository {
  static async findAll(
    is_active?: boolean,
    limit?: number,
    offset?: number,
    search?: string,
  ): Promise<IItemRow[]> {
    let query = "SELECT * FROM items";
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (is_active !== undefined) {
      whereClauses.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (search) {
      whereClauses.push("(item_code LIKE ? OR name LIKE ?)");
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    query += " ORDER BY item_code ASC";

    if (limit !== undefined && offset !== undefined) {
      query += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
    }

    const [rows] = await pool.query<IItemRow[]>(query, params);

    return rows;
  }

  static async count(is_active?: boolean, search?: string): Promise<number> {
    let query = "SELECT COUNT(*) as total FROM items";
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (is_active !== undefined) {
      whereClauses.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (search) {
      whereClauses.push("(item_code LIKE ? OR name LIKE ?)");
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    return (rows[0] as { total: number }).total;
  }


  static async findById(id: EntityId): Promise<IItemRow | null> {
    const [rows] = await pool.execute<IItemRow[]>("SELECT * FROM items WHERE id = ?", [id]);
    return rows[0] || null;
  }

  static async findByCode(code: string): Promise<IItemRow | null> {
    const [rows] = await pool.execute<IItemRow[]>("SELECT * FROM items WHERE item_code = ?", [code]);
    return rows[0] || null;
  }

  static async insert(data: ItemInsertInput): Promise<EntityId> {
    const id = generateEntityId();
    await pool.execute(
      "INSERT INTO items (id, item_code, name, base_price) VALUES (?, ?, ?, ?)",
      [id, data.item_code, data.name, data.base_price]
    );
    return id;
  }

  static async update(
    id: EntityId,
    data: Partial<ItemInsertInput> & { is_active?: boolean },
  ): Promise<void> {
    const fields = Object.keys(data);
    if (fields.length === 0) return;

    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    const values = [...Object.values(data), id];

    await pool.execute(`UPDATE items SET ${setClause} WHERE id = ?`, values);
  }

  static async delete(id: EntityId): Promise<void> {
    await pool.execute("DELETE FROM items WHERE id = ?", [id]);
  }
}

