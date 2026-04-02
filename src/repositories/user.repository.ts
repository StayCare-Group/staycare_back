import type { PoolConnection } from "mysql2/promise";
import pool from "../db/pool";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import type { UserRole } from "../utils/jwt";

export interface IUserMySQL {
  id?: number;
  name: string;
  email: string;
  password_hash: string;
  phone: string | null;
  language: "en" | "es";
  role: UserRole;
  role_id?: number;
  is_active?: boolean;
  refresh_token?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

const USER_BASE_SELECT = `
  SELECT u.id, u.name, u.email, u.password_hash, u.phone, u.language,
         r.name AS role, u.role_id, u.is_active, u.refresh_token, u.created_at, u.updated_at
  FROM users u
  INNER JOIN roles r ON u.role_id = r.id
`;

export class UserRepository {
  static async findByEmail(email: string): Promise<IUserMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${USER_BASE_SELECT} WHERE u.email = ? LIMIT 1`,
      [email]
    );
    return (rows[0] as IUserMySQL) || null;
  }

  static async findByPhone(phone: string): Promise<IUserMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${USER_BASE_SELECT} WHERE u.phone = ? LIMIT 1`,
      [phone]
    );
    return (rows[0] as IUserMySQL) || null;
  }

  static async findById(id: number | string): Promise<IUserMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${USER_BASE_SELECT} WHERE u.id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as IUserMySQL) || null;
  }

  static async insert(
    conn: PoolConnection,
    user: {
      name: string;
      email: string;
      password_hash: string;
      phone: string | null;
      language?: "en" | "es" | undefined;
      role_id: number;
      is_active?: boolean;
    }
  ): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, password_hash, phone, language, role_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.name,
        user.email,
        user.password_hash,
        user.phone,
        user.language || "en",
        user.role_id,
        user.is_active !== undefined ? user.is_active : true,
      ]
    );
    return result.insertId;
  }

  static async updateRefreshToken(userId: number | string, token: string | null): Promise<void> {
    await pool.execute("UPDATE users SET refresh_token = ? WHERE id = ?", [token, userId]);
  }

  static async update(
    id: number | string,
    data: Partial<IUserMySQL>,
    conn: PoolConnection | null = null
  ): Promise<void> {
    const allowed: Record<string, unknown> = {};
    if (data.name !== undefined) allowed.name = data.name;
    if (data.email !== undefined) allowed.email = data.email;
    if (data.phone !== undefined) allowed.phone = data.phone;
    if (data.language !== undefined) allowed.language = data.language;
    if (data.password_hash !== undefined) allowed.password_hash = data.password_hash;
    if (data.is_active !== undefined) allowed.is_active = data.is_active;

    const entries = Object.entries(allowed).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values: (string | number | boolean | null)[] = entries.map(([, v]) => v as string | number | boolean | null);
    values.push(id);

    const exec = conn ?? pool;
    await exec.execute(`UPDATE users SET ${setClause} WHERE id = ?`, values);
  }

  static async findByRefreshToken(token: string): Promise<IUserMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `${USER_BASE_SELECT} WHERE u.refresh_token = ? LIMIT 1`,
      [token]
    );
    return (rows[0] as IUserMySQL) || null;
  }

  static async countFiltered(filter: { role?: string; is_active?: boolean; search?: string }): Promise<number> {
    let where = "1=1";
    const params: (string | number | boolean)[] = [];
    if (filter.role) {
      where += " AND r.name = ?";
      params.push(filter.role);
    }
    if (filter.is_active !== undefined) {
      where += " AND u.is_active = ?";
      params.push(filter.is_active ? 1 : 0);
    }
    if (filter.search) {
      where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern, pattern);
    }
    const [rows] = await pool.query<RowDataPacket[]>(

      `SELECT COUNT(*) AS total FROM users u INNER JOIN roles r ON u.role_id = r.id WHERE ${where}`,
      params
    );
    return Number((rows[0] as { total: number }).total) || 0;
  }

  static async deleteById(id: number | string): Promise<void> {
    await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  }

  static async findManyFiltered(
    filter: { role?: string; is_active?: boolean; search?: string },
    limit: number,
    offset: number
  ): Promise<IUserMySQL[]> {
    let where = "1=1";
    const params: (string | number | boolean)[] = [];
    if (filter.role) {
      where += " AND r.name = ?";
      params.push(filter.role);
    }
    if (filter.is_active !== undefined) {
      where += " AND u.is_active = ?";
      params.push(filter.is_active ? 1 : 0);
    }
    if (filter.search) {
      where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern, pattern);
    }
    params.push(limit, offset);
    const [rows] = await pool.query<RowDataPacket[]>(
      `${USER_BASE_SELECT} WHERE ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      params
    );

    return rows as IUserMySQL[];
  }
}
