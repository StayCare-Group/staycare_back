import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientSubUserService } from "../../../src/services/clientSubUser.service";
import { UserRepository } from "../../../src/repositories/user.repository";
import { RoleRepository } from "../../../src/repositories/role.repository";
import * as bcrypt from "bcryptjs";

vi.mock("../../../src/repositories/user.repository");
vi.mock("../../../src/repositories/role.repository");
vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
}));

describe("ClientSubUserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSubUsers", () => {
    it("returns sub-users with permissions", async () => {
      vi.mocked(UserRepository.countSubUsersByClientId).mockResolvedValueOnce(1);
      vi.mocked(UserRepository.findSubUsersByClientId).mockResolvedValueOnce([
        { id: "sub-1", role_id: "role-1", password_hash: "xxx", refresh_token: "yyy" } as any
      ]);
      vi.mocked(RoleRepository.findPermissionNamesByRoleId).mockResolvedValueOnce(["orders:read"]);

      const result = await ClientSubUserService.getSubUsers("client-1", 1, 10);
      expect(result.total).toBe(1);
      expect(result.users).toHaveLength(1);
      expect(result.users[0].permissions).toEqual(["orders:read"]);
      expect((result.users[0] as any).password_hash).toBeUndefined();
    });
  });

  describe("getSubUserById", () => {
    it("throws if user not found", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce(null);
      await expect(ClientSubUserService.getSubUserById("client-1", "sub-1")).rejects.toThrow(/not found/);
    });

    it("throws if user belongs to another client", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ parent_client_id: "other-client" } as any);
      await expect(ClientSubUserService.getSubUserById("client-1", "sub-1")).rejects.toThrow(/not found/);
    });

    it("returns safe user with permissions", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ 
        id: "sub-1", parent_client_id: "client-1", role_id: "role-1", password_hash: "xxx" 
      } as any);
      vi.mocked(RoleRepository.findPermissionNamesByRoleId).mockResolvedValueOnce(["orders:write"]);

      const result = await ClientSubUserService.getSubUserById("client-1", "sub-1");
      expect(result.permissions).toEqual(["orders:write"]);
      expect((result as any).password_hash).toBeUndefined();
    });
  });

  describe("createSubUser", () => {
    it("throws if client not found", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce(null);
      await expect(ClientSubUserService.createSubUser("client-1", {} as any)).rejects.toThrow(/Client not found/);
    });

    it("throws if role not found", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ id: "client-1" } as any);
      vi.mocked(RoleRepository.findById).mockResolvedValueOnce(null);
      await expect(ClientSubUserService.createSubUser("client-1", { role_id: "role-1" } as any)).rejects.toThrow(/Role not found/);
    });

    it("creates the user and returns safe user data", async () => {
      vi.mocked(UserRepository.findById).mockResolvedValueOnce({ id: "client-1" } as any);
      vi.mocked(RoleRepository.findById).mockResolvedValueOnce({ id: "role-1", client_id: "client-1", name: "Custom" } as any);
      vi.mocked(UserRepository.create).mockResolvedValueOnce({ id: "sub-1", role_id: "role-1" } as any);
      vi.mocked(RoleRepository.findPermissionNamesByRoleId).mockResolvedValueOnce(["orders:read"]);

      const result = await ClientSubUserService.createSubUser("client-1", {
        name: "Test Sub", email: "sub@test.com", password: "123", role_id: "role-1"
      });

      expect(UserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: "Test Sub", email: "sub@test.com", parent_client_id: "client-1"
      }));
      expect(result.id).toBe("sub-1");
      expect(result.permissions).toEqual(["orders:read"]);
    });
  });
});
