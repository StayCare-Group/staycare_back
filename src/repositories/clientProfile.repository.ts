import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "../db/pool";

export type PricingTier = "standard" | "premium" | "enterprise";

export interface IClientProfileRow {
  id?: number;
  user_id: number;
  contact_person: string;
  vat_number: string;
  billing_address: string;
  credits_terms_days: number;
  pricing_tier: PricingTier;
  created_at?: Date;
  updated_at?: Date;
}

export type ClientListRow = {
  client_profile_id: number;
  user_id: number;
  contact_person: string;
  vat_number: string;
  billing_address: string;
  credits_terms_days: number;
  pricing_tier: PricingTier;
  created_at: Date;
  updated_at: Date;
  user_name: string;
  email: string;
  phone: string | null;
  language: string;
  is_active: number;
};

export class ClientProfileRepository {
  static async existsByVatNumber(vat: string): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM client_profiles WHERE vat_number = ? LIMIT 1",
      [vat]
    );
    return rows.length > 0;
  }

  static async findByUserId(userId: number): Promise<IClientProfileRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, contact_person, vat_number, billing_address,
              credits_terms_days, pricing_tier, created_at, updated_at
       FROM client_profiles WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    return (rows[0] as IClientProfileRow) || null;
  }

  static async findById(id: number): Promise<IClientProfileRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, user_id, contact_person, vat_number, billing_address,
              credits_terms_days, pricing_tier, created_at, updated_at
       FROM client_profiles WHERE id = ? LIMIT 1`,
      [id]
    );
    return (rows[0] as IClientProfileRow) || null;
  }

  static async findUserIdByProfileId(clientProfileId: number): Promise<number | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT user_id FROM client_profiles WHERE id = ? LIMIT 1",
      [clientProfileId]
    );
    const uid = (rows[0] as { user_id: number } | undefined)?.user_id;
    return uid ?? null;
  }

  static async countFiltered(filter: { is_active?: boolean | undefined; search?: string | undefined }): Promise<number> {
    let where = "1=1";
    const params: any[] = [];
    if (filter.is_active !== undefined) {
      where += " AND u.is_active = ?";
      params.push(filter.is_active ? 1 : 0);
    }
    if (filter.search) {
      where += " AND (cp.contact_person LIKE ? OR cp.vat_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM client_profiles cp INNER JOIN users u ON cp.user_id = u.id WHERE ${where}`,
      params
    );

    return Number((rows[0] as { total: number }).total) || 0;
  }

  static async listWithUsersPaginated(
    limit: number,
    offset: number,
    filter: { is_active?: boolean | undefined; search?: string | undefined } = {}
  ): Promise<ClientListRow[]> {

    let where = "1=1";
    const params: any[] = [];
    if (filter.is_active !== undefined) {
      where += " AND u.is_active = ?";
      params.push(filter.is_active ? 1 : 0);
    }
    if (filter.search) {
      where += " AND (cp.contact_person LIKE ? OR cp.vat_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)";
      const pattern = `%${filter.search}%`;
      params.push(pattern, pattern, pattern, pattern);

    }
    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT cp.id AS client_profile_id, cp.user_id, cp.contact_person, cp.vat_number, cp.billing_address,
              cp.credits_terms_days, cp.pricing_tier, cp.created_at, cp.updated_at,
              u.name AS user_name, u.email, u.phone, u.language, u.is_active
       FROM client_profiles cp
       INNER JOIN users u ON u.id = cp.user_id
       WHERE ${where}
       ORDER BY cp.id DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows as ClientListRow[];
  }

  static async update(
    clientProfileId: number,
    data: Partial<
      Pick<IClientProfileRow, "contact_person" | "vat_number" | "billing_address" | "credits_terms_days" | "pricing_tier">
    >
  ): Promise<void> {

    const allowed: Record<string, unknown> = {};
    if (data.contact_person !== undefined) allowed.contact_person = data.contact_person;
    if (data.vat_number !== undefined) allowed.vat_number = data.vat_number;
    if (data.billing_address !== undefined) allowed.billing_address = data.billing_address;
    if (data.credits_terms_days !== undefined) allowed.credits_terms_days = data.credits_terms_days;
    if (data.pricing_tier !== undefined) allowed.pricing_tier = data.pricing_tier;

    const entries = Object.entries(allowed).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
    const values = entries.map(([, v]) => v) as (string | number)[];
    values.push(clientProfileId);
    await pool.execute(`UPDATE client_profiles SET ${setClause} WHERE id = ?`, values);
  }

  static async insert(
    conn: PoolConnection,
    row: {
      user_id: number;
      contact_person: string;
      vat_number: string;
      billing_address: string;
      credits_terms_days?: number;
      pricing_tier?: PricingTier;
    }
  ): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO client_profiles
        (user_id, contact_person, vat_number, billing_address, credits_terms_days, pricing_tier)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.user_id,
        row.contact_person,
        row.vat_number,
        row.billing_address,
        row.credits_terms_days ?? 30,
        row.pricing_tier ?? "standard",
      ]
    );
    return result.insertId;
  }
}
