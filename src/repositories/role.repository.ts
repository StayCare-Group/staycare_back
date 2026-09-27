import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "../db/pool";
import { generateEntityId, type EntityId } from "../utils/id";
import type { IPermissionRow } from "./permission.repository";

export interface IRoleRow {
  id: EntityId;
  name: string;
  client_id?: EntityId | null;
  is_system?: boolean;
  created_at?: Date;
}

export class RoleRepository {
  static async findById(id: EntityId): Promise<IRoleRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, client_id, is_system, created_at FROM roles WHERE id = ? LIMIT 1",
      [id]
    );
    return (rows[0] as IRoleRow) || null;
  }

  static async findByName(name: string): Promise<IRoleRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, client_id, is_system, created_at FROM roles WHERE name = ? LIMIT 1",
      [name]
    );
    return (rows[0] as IRoleRow) || null;
  }

  static async getIdByName(name: string): Promise<EntityId> {
    const role = await this.findByName(name);
    if (!role) throw new Error(`Role '${name}' not found`);
    return role.id;
  }

  static async findRolesForClient(clientId: EntityId): Promise<IRoleRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, client_id, is_system, created_at FROM roles WHERE client_id = ? OR is_system = 1 ORDER BY is_system DESC, name ASC",
      [clientId]
    );
    return rows as IRoleRow[];
  }

  static async findCustomRolesForClient(clientId: EntityId): Promise<IRoleRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, client_id, is_system, created_at FROM roles WHERE client_id = ? AND is_system = 0 ORDER BY name ASC",
      [clientId]
    );
    return rows as IRoleRow[];
  }

  static async findCustomRoleByIdAndClient(roleId: EntityId, clientId: EntityId): Promise<IRoleRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name, client_id, is_system, created_at FROM roles WHERE id = ? AND client_id = ? AND is_system = 0 LIMIT 1",
      [roleId, clientId]
    );
    return (rows[0] as IRoleRow) || null;
  }

  static async insertCustomRole(
    conn: PoolConnection | null,
    clientId: EntityId,
    name: string
  ): Promise<EntityId> {
    const exec = conn || pool;
    const roleId = generateEntityId();
    await exec.execute(
      "INSERT INTO roles (id, name, client_id, is_system) VALUES (?, ?, ?, 0)",
      [roleId, name, clientId]
    );
    return roleId;
  }

  static async updateCustomRole(
    conn: PoolConnection | null,
    roleId: EntityId,
    clientId: EntityId,
    name: string
  ): Promise<boolean> {
    const exec = conn || pool;
    const [result]: any = await exec.execute(
      "UPDATE roles SET name = ? WHERE id = ? AND client_id = ? AND is_system = 0",
      [name, roleId, clientId]
    );
    return result.affectedRows > 0;
  }

  static async deleteCustomRole(roleId: EntityId, clientId: EntityId): Promise<boolean> {
    const [result]: any = await pool.execute(
      "DELETE FROM roles WHERE id = ? AND client_id = ? AND is_system = 0",
      [roleId, clientId]
    );
    return result.affectedRows > 0;
  }

  static async assignPermissionsToRole(
    conn: PoolConnection | null,
    roleId: EntityId,
    permissionIds: EntityId[]
  ): Promise<void> {
    const exec = conn || pool;
    await exec.execute("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);
    for (const pid of permissionIds) {
      await exec.execute(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
        [roleId, pid]
      );
    }
  }

  static async findPermissionsByRoleId(roleId: EntityId): Promise<IPermissionRow[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.name, p.description, p.created_at
       FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId]
    );
    return rows as IPermissionRow[];
  }

  static async findPermissionNamesByRoleId(roleId: EntityId): Promise<string[]> {
    const perms = await this.findPermissionsByRoleId(roleId);
    return perms.map((p) => p.name);
  }
}
