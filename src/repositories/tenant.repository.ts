import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "../db/pool";
import { generateEntityId, type EntityId } from "../utils/id";

export interface ITenantRow {
  id: EntityId;
  name: string;
  created_at?: Date;
}

export interface IRoleRow {
  id: EntityId;
  name: string;
  tenant_id?: EntityId | null;
  is_system?: boolean;
  created_at?: Date;
}

export interface IPermissionRow {
  id: EntityId;
  name: string;
  description?: string;
}

export class TenantRepository {
  static async findById(id: EntityId): Promise<ITenantRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, created_at FROM tenants WHERE id = ? LIMIT 1",
      [id]
    );
    return (rows[0] as ITenantRow) || null;
  }

  static async findManyPaginated(limit: number, offset: number): Promise<ITenantRow[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, created_at FROM tenants ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    return rows as ITenantRow[];
  }

  static async countAll(): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM tenants"
    );
    return Number((rows[0] as { total: number }).total) || 0;
  }

  static async insert(conn: PoolConnection, data: { name: string }): Promise<EntityId> {
    const id = generateEntityId();
    await conn.execute("INSERT INTO tenants (id, name) VALUES (?, ?)", [id, data.name]);
    return id;
  }

  // --- Roles & Permissions ---

  static async insertCustomRole(
    conn: PoolConnection,
    tenantId: EntityId,
    name: string
  ): Promise<EntityId> {
    const roleId = generateEntityId();
    await conn.execute(
      "INSERT INTO roles (id, name, tenant_id, is_system) VALUES (?, ?, ?, 0)",
      [roleId, name, tenantId]
    );
    return roleId;
  }

  static async assignPermissionToRole(
    conn: PoolConnection,
    roleId: EntityId,
    permissionId: EntityId
  ): Promise<void> {
    await conn.execute(
      "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
      [roleId, permissionId]
    );
  }

  static async findRoleById(roleId: EntityId): Promise<IRoleRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, tenant_id, is_system, created_at FROM roles WHERE id = ? LIMIT 1",
      [roleId]
    );
    return (rows[0] as IRoleRow) || null;
  }

  static async findRolesByTenantId(tenantId: EntityId): Promise<IRoleRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, tenant_id, is_system, created_at FROM roles WHERE tenant_id = ? OR is_system = 1 ORDER BY is_system DESC, name ASC",
      [tenantId]
    );
    return rows as IRoleRow[];
  }

  static async findPermissionsByRoleId(roleId: EntityId): Promise<IPermissionRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.name, p.description 
       FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId]
    );
    return rows as IPermissionRow[];
  }
}
