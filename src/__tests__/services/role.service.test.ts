import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoleService } from "../../../src/services/role.service";
import { RoleRepository } from "../../../src/repositories/role.repository";
import { UserRepository } from "../../../src/repositories/user.repository";
import { PermissionRepository } from "../../../src/repositories/permission.repository";
import pool from "../../../src/db/pool";

vi.mock("../../../src/repositories/role.repository");
vi.mock("../../../src/repositories/user.repository");
vi.mock("../../../src/repositories/permission.repository");
vi.mock("../../../src/db/pool");

describe("RoleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getClientRoles", () => {
    it("throws if client not found", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce(null);
      await expect(RoleService.getClientRoles("client-1")).rejects.toThrow(/Client not found/);
    });

    it("returns custom roles for the client", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ id: "client-1" } as any);
      vi.mocked(RoleRepository.findCustomRolesForClient).mockResolvedValueOnce([
        { id: "role-1", name: "Custom Role 1" } as any
      ]);
      vi.mocked(RoleRepository.findPermissionsByRoleId).mockResolvedValueOnce([]);

      const result = await RoleService.getClientRoles("client-1");
      expect(RoleRepository.findCustomRolesForClient).toHaveBeenCalledWith("client-1");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Custom Role 1");
    });
  });

  describe("createCustomRole", () => {
    it("throws if client not found", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce(null);
      await expect(RoleService.createCustomRole("client-1", { name: "New Role", permissions: [] })).rejects.toThrow(/Client not found/);
    });

    it("creates custom role and assigns permissions", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ id: "client-1" } as any);
      vi.mocked(PermissionRepository.findByIds).mockResolvedValueOnce([{ id: "perm-1", name: "read" }]);
      vi.mocked(PermissionRepository.findByNames).mockResolvedValueOnce([]);
      
      const mockConn = {
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      };
      vi.mocked(pool.getConnection).mockResolvedValueOnce(mockConn as any);
      vi.mocked(RoleRepository.insertCustomRole).mockResolvedValueOnce("new-role-id");
      vi.mocked(RoleRepository.findById).mockResolvedValueOnce({ id: "new-role-id", name: "New Role" } as any);

      const result = await RoleService.createCustomRole("client-1", { name: "New Role", permissions: ["perm-1"] });
      
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(RoleRepository.insertCustomRole).toHaveBeenCalledWith(mockConn, "client-1", "New Role");
      expect(RoleRepository.assignPermissionsToRole).toHaveBeenCalledWith(mockConn, "new-role-id", ["perm-1"]);
      expect(mockConn.commit).toHaveBeenCalled();
      expect(result.id).toBe("new-role-id");
      expect(result.name).toBe("New Role");
      expect(result.permissions[0].name).toBe("read");
    });
  });
});
