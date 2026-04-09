import bcrypt from "bcryptjs";
import { UserRepository, type IUserMySQL } from "../repositories/user.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { PropertyRepository, type IPropertyRow } from "../repositories/property.repository";
import { AppError } from "../utils/AppError";
import { duplicateEntryMessage } from "../utils/mysqlErrors";
import type { IClientProfileRow } from "../repositories/clientProfile.repository";
import type { EntityId } from "../utils/id";

const SALT_ROUNDS = 10;

export type UpdateClientProfileBody = {
  company_name?: string;
  contact_person?: string;
  vat_number?: string;
  email?: string;
  phone?: string | null;
  billing_address?: string;
  credits_terms_days?: number;
  pricing_tier?: "standard" | "premium" | "enterprise";
};

export type UpdateUserByAdminBody = {
  password?: string;
  name?: string;
  email?: string;
  phone?: string;
  language?: "en" | "es";
  is_active?: boolean;
  client_profile?: {
    contact_person?: string;
    vat_number?: string;
    billing_address?: string;
    credits_terms_days?: number;
    pricing_tier?: "standard" | "premium" | "enterprise";
  };
};


/**
 * Dominio de **usuarios** (`users`): un cliente es un usuario con rol `client` y filas relacionadas
 * (`client_profiles`). La lógica de sedes (`properties`) se ha movido a PropertyService.
 */
export class UserService {
  // --- Listado / detalle (rol client vía client_profiles.id en rutas /api/clients) ---

  static async getAllClients(page: number, limit: number, filter: { is_active?: boolean | undefined; search?: string | undefined } = {}) {
    const offset = (page - 1) * limit;
    const total = await ClientProfileRepository.countFiltered(filter);
    const rows = await ClientProfileRepository.listWithUsersPaginated(limit, offset, filter);
    return { rows, total };
  }


  static async getUserDetailByUserId(userId: EntityId): Promise<{
    client_profile: IClientProfileRow | null;
    user: IUserMySQL;
  } | null> {
    const user = await UserRepository.findById(userId);
    if (!user) return null;
    const profile = await ClientProfileRepository.findByUserId(userId);
    return { client_profile: profile, user };
  }

  static async userOwnsProfile(authUserId: EntityId, targetUserId: EntityId): Promise<boolean> {
    return authUserId === targetUserId;
  }

  static async updateClientProfile(userId: EntityId, body: UpdateClientProfileBody): Promise<void> {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    if (body.email) {
      const existing = await UserRepository.findByEmail(body.email);
      if (existing && existing.id !== userId) {
        throw new AppError("Email already in use", 409);
      }
    }

    if (body.phone) {
      const existingPhone = await UserRepository.findByPhone(body.phone);
      if (existingPhone && existingPhone.id !== userId) {
        throw new AppError("Phone already in use", 409);
      }
    }


    const userPatch: Parameters<typeof UserRepository.update>[1] = {};
    if (body.company_name !== undefined) userPatch.name = body.company_name;
    if (body.email !== undefined) userPatch.email = body.email;
    if (body.phone !== undefined) userPatch.phone = body.phone;

    const profilePatch: Parameters<typeof ClientProfileRepository.update>[1] = {};
    if (body.contact_person !== undefined) profilePatch.contact_person = body.contact_person;
    if (body.vat_number !== undefined) profilePatch.vat_number = body.vat_number;
    if (body.billing_address !== undefined) profilePatch.billing_address = body.billing_address;
    if (body.credits_terms_days !== undefined) profilePatch.credits_terms_days = body.credits_terms_days;
    if (body.pricing_tier !== undefined) profilePatch.pricing_tier = body.pricing_tier;

    try {
      if (Object.keys(userPatch).length) await UserRepository.update(userId, userPatch);
      
      const profile = await ClientProfileRepository.findByUserId(userId);
      if (Object.keys(profilePatch).length && profile?.id) {
        await ClientProfileRepository.update(profile.id, profilePatch);
      }
    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }
  }

  static async deleteUserById(userId: EntityId): Promise<void> {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    await UserRepository.deleteById(userId);
  }

  /** Resuelve `users.id` → (Legacy check, now just ensures role is client). */
  static async ensureClientRoleOrThrow(userId: EntityId): Promise<void> {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    if (user.role !== "client") {
      throw new AppError("Properties apply only to users with client role", 400);
    }
  }

  // --- Gestión directa por `users.id` (rutas /api/users) ---

  static async getAllUsers(
    filter: { role?: string; is_active?: boolean; search?: string },
    page: number,
    limit: number
  ) {
    const offset = (page - 1) * limit;
    const users = await UserRepository.findManyFiltered(filter, limit, offset);
    const total = await UserRepository.countFiltered(filter);
    return { users, total };
  }

  static async getUserByIdWithClientProfileIfExists(
    rawId: EntityId
  ): Promise<{ 
    user: IUserMySQL; 
    client_profile: IClientProfileRow | null; 
    properties: IPropertyRow[] | null 
  }> {
    const user = await UserRepository.findById(rawId);
    if (!user) throw new AppError("User not found", 404);

    let client_profile: IClientProfileRow | null = null;
    let properties: IPropertyRow[] | null = null;

    if (user.role === "client") {
      client_profile = await ClientProfileRepository.findByUserId(user.id!);
      if (client_profile?.id) {
        properties = await PropertyRepository.listByUserId(user.id!);
      }
    }

    return { user, client_profile, properties };
  }

  static async updateUserByAdmin(rawId: string, body: UpdateUserByAdminBody): Promise<{
    user: IUserMySQL;
    client_profile: IClientProfileRow | null;
    properties: IPropertyRow[] | null;
  }> {
    const { password, client_profile: profileToUpdate, ...rest } = body;


    const existing = await UserRepository.findById(rawId);
    if (!existing) throw new AppError("User not found", 404);

    if (rest.email && rest.email !== existing.email) {
      const taken = await UserRepository.findByEmail(rest.email);
      if (taken) throw new AppError("Email already in use", 409);
    }

    if (rest.phone && rest.phone !== existing.phone) {
      const takenPhone = await UserRepository.findByPhone(rest.phone);
      if (takenPhone) throw new AppError("Phone already in use", 409);
    }

    const updateData: Parameters<typeof UserRepository.update>[1] = { ...rest };
    if (password) {
      updateData.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    try {
      await UserRepository.update(rawId, updateData);

      // Si es un cliente y viene información de perfil, actualizarla
      if (existing.role === "client" && profileToUpdate) {
        const currentProfile = await ClientProfileRepository.findByUserId(rawId);
        if (currentProfile?.id) {
          await ClientProfileRepository.update(currentProfile.id, profileToUpdate);
        }
      }

    } catch (err) {
      const dup = duplicateEntryMessage(err);
      if (dup) throw new AppError(dup, 409);
      throw err;
    }

    const user = await UserRepository.findById(rawId);
    if (!user) throw new AppError("User not found", 404);

    let client_profile: IClientProfileRow | null = null;
    let properties: IPropertyRow[] | null = null;

    if (user.role === "client") {
      client_profile = await ClientProfileRepository.findByUserId(user.id!);
      if (client_profile?.id) {
        properties = await PropertyRepository.listByUserId(user.id!);
      }
    }

    return { user, client_profile, properties };
  }

  static async deactivateUser(rawId: string): Promise<IUserMySQL> {
    const user = await UserRepository.findById(rawId);
    if (!user) throw new AppError("User not found", 404);

    await UserRepository.update(rawId, { is_active: false });

    const updated = await UserRepository.findById(rawId);
    if (!updated) throw new AppError("User not found", 404);
    return updated;
  }
}
