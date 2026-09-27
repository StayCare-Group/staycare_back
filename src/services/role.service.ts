import { RoleRepository, type IRoleRow } from "../repositories/role.repository";
import { PermissionRepository, type IPermissionRow } from "../repositories/permission.repository";
import { UserRepository } from "../repositories/user.repository";
import { withTransaction } from "../db/transaction";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { EntityId } from "../utils/id";

export interface IRoleWithPermissions extends IRoleRow {
  permissions: IPermissionRow[];
}

export class RoleService {
  static async getAllPermissions(): Promise<IPermissionRow[]> {
    return await PermissionRepository.findAll();
  }

  static async getClientRoles(clientId: EntityId, includeSystemRoles: boolean = false): Promise<IRoleWithPermissions[]> {
    const clientUser = await UserRepository.findById(clientId);
    if (!clientUser) throw new AppError("Client not found", 404);

    const roles = includeSystemRoles 
      ? await RoleRepository.findRolesForClient(clientId)
      : await RoleRepository.findCustomRolesForClient(clientId);
    const result: IRoleWithPermissions[] = [];

    for (const r of roles) {
      const perms = await RoleRepository.findPermissionsByRoleId(r.id);
      result.push({ ...r, permissions: perms });
    }

    return result;
  }

  static async createCustomRole(
    clientId: EntityId,
    data: { name: string; permissions: string[] }
  ): Promise<IRoleWithPermissions> {
    const clientUser = await UserRepository.findById(clientId);
    if (!clientUser) throw new AppError("Client not found", 404);

    // Resolve permission IDs from names or IDs
    let permissionRows: IPermissionRow[] = [];
    if (data.permissions && data.permissions.length > 0) {
      const byIds = await PermissionRepository.findByIds(data.permissions);
      const byNames = await PermissionRepository.findByNames(data.permissions);
      const map = new Map<string, IPermissionRow>();
      [...byIds, ...byNames].forEach((p) => map.set(p.id.toString(), p));
      permissionRows = Array.from(map.values());
    }

    if (permissionRows.length === 0) {
      throw new AppError("At least one valid permission is required", 400);
    }

    try {
      const roleId = await withTransaction(async (conn) => {
        const newRoleId = await RoleRepository.insertCustomRole(conn, clientId, data.name);
        await RoleRepository.assignPermissionsToRole(
          conn,
          newRoleId,
          permissionRows.map((p) => p.id)
        );
        return newRoleId;
      });

      const role = await RoleRepository.findById(roleId);
      if (!role) throw new AppError("Failed to create custom role", 500);

      return {
        ...role,
        permissions: permissionRows,
      };
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async updateCustomRole(
    clientId: EntityId,
    roleId: EntityId,
    data: { name?: string; permissions?: string[] }
  ): Promise<IRoleWithPermissions> {
    const existing = await RoleRepository.findCustomRoleByIdAndClient(roleId, clientId);
    if (!existing) {
      throw new AppError("Custom role not found for this client", 404);
    }

    try {
      await withTransaction(async (conn) => {
        if (data.name) {
          await RoleRepository.updateCustomRole(conn, roleId, clientId, data.name);
        }
        if (data.permissions) {
          const byIds = await PermissionRepository.findByIds(data.permissions);
          const byNames = await PermissionRepository.findByNames(data.permissions);
          const map = new Map<string, IPermissionRow>();
          [...byIds, ...byNames].forEach((p) => map.set(p.id.toString(), p));
          const permissionRows = Array.from(map.values());

          await RoleRepository.assignPermissionsToRole(
            conn,
            roleId,
            permissionRows.map((p) => p.id)
          );
        }
      });

      const updated = await RoleRepository.findById(roleId);
      const perms = await RoleRepository.findPermissionsByRoleId(roleId);
      return {
        ...updated!,
        permissions: perms,
      };
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async deleteCustomRole(clientId: EntityId, roleId: EntityId): Promise<void> {
    const existing = await RoleRepository.findCustomRoleByIdAndClient(roleId, clientId);
    if (!existing) {
      throw new AppError("Custom role not found for this client", 404);
    }

    // Check if users are assigned to this role
    const total = await UserRepository.countFiltered({ role: existing.name });
    if (total > 0) {
      throw new AppError("Cannot delete role assigned to active users", 409);
    }

    await RoleRepository.deleteCustomRole(roleId, clientId);
  }
}
