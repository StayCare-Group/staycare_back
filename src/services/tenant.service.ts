import { TenantRepository, type ITenantRow, type IRoleRow } from "../repositories/tenant.repository";
import { withTransaction } from "../db/transaction";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { EntityId } from "../utils/id";
import type { CreateTenantInput, CreateCustomRoleInput } from "../validation/tenant.validation";

export class TenantService {
  static async getAllTenants(page: number, limit: number): Promise<{ tenants: ITenantRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const total = await TenantRepository.countAll();
    const tenants = await TenantRepository.findManyPaginated(limit, offset);
    return { tenants, total };
  }

  static async getTenantById(tenantId: EntityId): Promise<ITenantRow> {
    const tenant = await TenantRepository.findById(tenantId);
    if (!tenant) throw new AppError("Tenant not found", 404);
    return tenant;
  }

  static async createTenant(data: CreateTenantInput): Promise<ITenantRow> {
    try {
      const tenantId = await withTransaction(async (conn) => {
        return await TenantRepository.insert(conn, data);
      });

      const newTenant = await TenantRepository.findById(tenantId);
      if (!newTenant) throw new AppError("Failed to create tenant", 500);
      return newTenant;
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async createCustomRole(
    tenantId: EntityId,
    data: CreateCustomRoleInput
  ): Promise<IRoleRow & { permissions: string[] }> {
    const tenant = await TenantRepository.findById(tenantId);
    if (!tenant) throw new AppError("Tenant not found", 404);

    try {
      const roleId = await withTransaction(async (conn) => {
        const newRoleId = await TenantRepository.insertCustomRole(conn, tenantId, data.name);
        for (const permissionId of data.permissions) {
          await TenantRepository.assignPermissionToRole(conn, newRoleId, permissionId);
        }
        return newRoleId;
      });

      const role = await TenantRepository.findRoleById(roleId);
      if (!role) throw new AppError("Failed to create custom role", 500);

      const perms = await TenantRepository.findPermissionsByRoleId(roleId);
      return {
        ...role,
        permissions: perms.map((p) => p.name),
      };
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async getTenantRoles(tenantId: EntityId): Promise<IRoleRow[]> {
    const tenant = await TenantRepository.findById(tenantId);
    if (!tenant) throw new AppError("Tenant not found", 404);

    return await TenantRepository.findRolesByTenantId(tenantId);
  }
}
