import bcrypt from "bcryptjs";
import { UserRepository, type IUserMySQL } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { EntityId } from "../utils/id";

const SALT_ROUNDS = 10;

export interface CreateSubUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  language?: "en" | "es";
  role_id: EntityId;
}

export interface UpdateSubUserInput {
  name?: string;
  email?: string;
  password?: string;
  phone?: string | null;
  language?: "en" | "es";
  role_id?: EntityId;
  is_active?: boolean;
}

export type ISafeSubUser = Omit<IUserMySQL, "password_hash" | "refresh_token"> & { permissions?: string[] };

export class ClientSubUserService {
  static async getSubUsers(
    clientId: EntityId,
    page: number,
    limit: number,
    search?: string
  ): Promise<{ users: ISafeSubUser[]; total: number }> {
    const offset = (page - 1) * limit;
    const total = await UserRepository.countSubUsersByClientId(clientId, search);
    const users = await UserRepository.findSubUsersByClientId(clientId, limit, offset, search);

    const result: ISafeSubUser[] = [];
    for (const u of users) {
      const perms = u.role_id ? await RoleRepository.findPermissionNamesByRoleId(u.role_id) : [];
      const { password_hash, refresh_token, ...safeUser } = u;
      result.push({ ...safeUser, permissions: perms });
    }

    return { users: result, total };
  }

  static async getSubUserById(
    clientId: EntityId,
    subUserId: EntityId
  ): Promise<ISafeSubUser> {
    const user = await UserRepository.findById(subUserId);
    if (!user || user.parent_client_id !== clientId) {
      throw new AppError("Sub-user not found", 404);
    }
    
    const perms = user.role_id ? await RoleRepository.findPermissionNamesByRoleId(user.role_id) : [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, refresh_token, ...safeUser } = user;
    return { ...safeUser, permissions: perms };
  }

  static async createSubUser(
    clientId: EntityId,
    data: CreateSubUserInput
  ): Promise<ISafeSubUser> {
    const client = await UserRepository.findById(clientId);
    if (!client) throw new AppError("Client not found", 404);

    // Verify target role
    const role = await RoleRepository.findById(data.role_id);
    if (!role) throw new AppError("Role not found", 404);

    if (!role.is_system && String(role.client_id) !== String(clientId)) {
      throw new AppError("Invalid role for this client", 403);
    }

    // Check duplicate email / phone
    const existingEmail = await UserRepository.findByEmail(data.email);
    if (existingEmail) throw new AppError("Email already in use", 409);

    if (data.phone) {
      const existingPhone = await UserRepository.findByPhone(data.phone);
      if (existingPhone) throw new AppError("Phone already in use", 409);
    }

    const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

    try {
      const userId = await UserRepository.insert(null, {
        name: data.name,
        email: data.email,
        password_hash,
        phone: data.phone ?? null,
        language: data.language ?? "en",
        role_id: data.role_id,
        parent_client_id: clientId,
        is_active: true,
      });

      const newUser = await UserRepository.findById(userId);
      if (!newUser) throw new AppError("Failed to create user", 500);

      const perms = await RoleRepository.findPermissionNamesByRoleId(newUser.role_id!);
      const { password_hash: _, refresh_token: __, ...safeUser } = newUser;
      return { ...safeUser, permissions: perms };
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async updateSubUser(
    clientId: EntityId,
    subUserId: EntityId,
    data: UpdateSubUserInput
  ): Promise<ISafeSubUser> {
    const subUser = await UserRepository.findById(subUserId);
    if (!subUser) throw new AppError("Sub-user not found", 404);

    if (String(subUser.parent_client_id) !== String(clientId)) {
      throw new AppError("Sub-user does not belong to this client", 403);
    }

    if (data.role_id) {
      const role = await RoleRepository.findById(data.role_id);
      if (!role) throw new AppError("Role not found", 404);
      if (!role.is_system && String(role.client_id) !== String(clientId)) {
        throw new AppError("Invalid role for this client", 403);
      }
    }

    if (data.email && data.email !== subUser.email) {
      const taken = await UserRepository.findByEmail(data.email);
      if (taken) throw new AppError("Email already in use", 409);
    }

    if (data.phone && data.phone !== subUser.phone) {
      const takenPhone = await UserRepository.findByPhone(data.phone);
      if (takenPhone) throw new AppError("Phone already in use", 409);
    }

    const patch: Partial<IUserMySQL> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.email !== undefined) patch.email = data.email;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.language !== undefined) patch.language = data.language;
    if (data.role_id !== undefined) patch.role_id = data.role_id;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.password) {
      patch.password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);
    }

    try {
      await UserRepository.update(subUserId, patch);
      const updated = await UserRepository.findById(subUserId);
      const perms = updated?.role_id ? await RoleRepository.findPermissionNamesByRoleId(updated.role_id) : [];
      const { password_hash: _, refresh_token: __, ...safeUser } = updated!;
      return { ...safeUser, permissions: perms };
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async deleteSubUser(clientId: EntityId, subUserId: EntityId): Promise<void> {
    const subUser = await UserRepository.findById(subUserId);
    if (!subUser) throw new AppError("Sub-user not found", 404);

    if (String(subUser.parent_client_id) !== String(clientId)) {
      throw new AppError("Sub-user does not belong to this client", 403);
    }

    await UserRepository.deleteById(subUserId);
  }
}
