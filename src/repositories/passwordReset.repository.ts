import pool from "../db/pool";
import { RowDataPacket } from "mysql2";
import { generateEntityId, type EntityId } from "../utils/id";

export interface IPasswordResetMySQL {
  id?: EntityId;
  email: string;
  token: string;
  expires_at: Date;
  used: boolean;
  created_at?: Date;
}

export class PasswordResetRepository {
  static async create(data: { email: string; token: string; expires_at: Date }): Promise<EntityId> {
    const id = generateEntityId();
    await pool.execute(
      "INSERT INTO password_resets (id, email, token, expires_at, used) VALUES (?, ?, ?, ?, 0)",
      [id, data.email, data.token, data.expires_at]
    );
    return id;
  }

  static async findActiveByToken(token: string): Promise<IPasswordResetMySQL | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW() LIMIT 1",
      [token]
    );
    return (rows[0] as IPasswordResetMySQL) || null;
  }

  static async markAsUsed(id: EntityId): Promise<void> {
    await pool.execute(
      "UPDATE password_resets SET used = 1 WHERE id = ?",
      [id]
    );
  }
}
