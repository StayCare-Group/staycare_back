import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "../db/pool";

export interface IPropertyRow {
  id?: number;
  user_id: number;
  property_name: string;
  address: string;
  city: string;
  area: string;
  access_notes: string | null;
  lat: string | null;
  lng: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export type PropertyInsertInput = {
  user_id: number;
  property_name: string;
  address: string;
  city: string;
  area: string;
  access_notes?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export class PropertyRepository {
  static executor(conn: PoolConnection | null) {
    return conn ?? pool;
  }

  static async listByUserId(userId: number): Promise<IPropertyRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, property_name, address, city, area,
              access_notes, lat, lng, created_at, updated_at
       FROM properties WHERE user_id = ? ORDER BY id ASC`,
      [userId]
    );
    return rows as IPropertyRow[];
  }

  static async findById(id: number): Promise<IPropertyRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, property_name, address, city, area,
              access_notes, lat, lng, created_at, updated_at
       FROM properties WHERE id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as IPropertyRow) || null;
  }

  static async findByLatLng(
    userId: number,
    lat: string | number,
    lng: string | number
  ): Promise<IPropertyRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, property_name, address, city, area,
              access_notes, lat, lng, created_at, updated_at
       FROM properties 
       WHERE user_id = ? AND lat = ? AND lng = ? LIMIT 1`,
      [userId, String(lat), String(lng)]
    );
    return (rows[0] as IPropertyRow) || null;
  }

  static async insert(conn: PoolConnection | null, row: PropertyInsertInput): Promise<number> {
    const exec = this.executor(conn);
    const [result] = await exec.execute<ResultSetHeader>(
      `INSERT INTO properties
        (user_id, property_name, address, city, area, access_notes, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.user_id,
        row.property_name,
        row.address,
        row.city,
        row.area,
        row.access_notes ?? null,
        row.lat ?? null,
        row.lng ?? null,
      ]
    );
    return result.insertId;
  }

  static async update(
    id: number,
    data: Partial<
      Pick<IPropertyRow, "property_name" | "address" | "city" | "area" | "access_notes" | "lat" | "lng">
    >
  ): Promise<void> {
    const allowed: Record<string, unknown> = {};
    if (data.property_name !== undefined) allowed.property_name = data.property_name;
    if (data.address !== undefined) allowed.address = data.address;
    if (data.city !== undefined) allowed.city = data.city;
    if (data.area !== undefined) allowed.area = data.area;
    if (data.access_notes !== undefined) allowed.access_notes = data.access_notes;
    if (data.lat !== undefined) allowed.lat = data.lat;
    if (data.lng !== undefined) allowed.lng = data.lng;

    const entries = Object.entries(allowed).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v) as (string | number | null)[];
    values.push(id);
    await pool.execute(`UPDATE properties SET ${setClause} WHERE id = ?`, values);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute("DELETE FROM properties WHERE id = ?", [id]);
  }
}
