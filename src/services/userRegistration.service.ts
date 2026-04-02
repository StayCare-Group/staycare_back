import bcrypt from "bcryptjs";
import { withTransaction } from "../db/transaction";
import { UserRepository } from "../repositories/user.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { RoleRepository } from "../repositories/role.repository";
import { PropertyRepository, type PropertyInsertInput } from "../repositories/property.repository";
import { AppError } from "../utils/AppError";
import type { UserRole } from "../utils/jwt";
import type { IUserMySQL } from "../repositories/user.repository";

const SALT_ROUNDS = 10;

export type ClientProfileInput = {
  contact_person: string;
  billing_address: string;
  credits_terms_days?: number;
  pricing_tier?: "standard" | "premium" | "enterprise";
};

export type PropertyCreateRow = {
  property_name: string;
  address: string;
  city: string;
  area: string;
  access_notes?: string;
  lat?: number;
  lng?: number;
};

export type RegisterClientPayload = {
  name: string;
  email: string;
  password: string;
  phone: string;
  language?: "en" | "es";
  client_profile?: ClientProfileInput;
  properties?: PropertyCreateRow[];
};

export type AdminCreateUserPayload = {
  name: string;
  email: string;
  password: string;
  phone: string;
  language?: "en" | "es";
  role: UserRole;
  client_profile?: ClientProfileInput;
  properties?: PropertyCreateRow[];
};

export class UserRegistrationService {
  static async registerClient(payload: RegisterClientPayload): Promise<IUserMySQL> {
    const existingEmail = await UserRepository.findByEmail(payload.email);
    if (existingEmail) throw new AppError("Email already in use", 409);

    const existingPhone = await UserRepository.findByPhone(payload.phone);
    if (existingPhone) throw new AppError("Phone already in use", 409);

    const roleId = await RoleRepository.getIdByName("client");
    const password_hash = await bcrypt.hash(payload.password, SALT_ROUNDS);

    const userId = await withTransaction(async (conn) => {
      const uid = await UserRepository.insert(conn, {
        name: payload.name,
        email: payload.email,
        password_hash,
        phone: payload.phone,
        language: payload.language,
        role_id: roleId,
      });

      if (payload.client_profile) {
        const profileId = await ClientProfileRepository.insert(conn, {
          user_id: uid,
          contact_person: payload.client_profile.contact_person,
          billing_address: payload.client_profile.billing_address,
          ...(payload.client_profile.credits_terms_days !== undefined
            ? { credits_terms_days: payload.client_profile.credits_terms_days }
            : {}),
          ...(payload.client_profile.pricing_tier !== undefined
            ? { pricing_tier: payload.client_profile.pricing_tier }
            : {}),
        });

        for (const p of payload.properties ?? []) {
          const row: PropertyInsertInput = {
            user_id: uid,
            property_name: p.property_name,
            address: p.address,
            city: p.city,
            area: p.area,
            access_notes: p.access_notes ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
          };
          await PropertyRepository.insert(conn, row);
        }
      }
      return uid;
    });

    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("Failed to retrieve created user", 500);
    return user;
  }

  static async createUserAdmin(payload: AdminCreateUserPayload): Promise<IUserMySQL> {
    const existingEmail = await UserRepository.findByEmail(payload.email);
    if (existingEmail) throw new AppError("Email already in use", 409);

    const existingPhone = await UserRepository.findByPhone(payload.phone);
    if (existingPhone) throw new AppError("Phone already in use", 409);

    if (payload.role !== "client") {
      if (payload.client_profile) {
        throw new AppError("client_profile is only allowed for client role", 400);
      }
    }

    const roleId = await RoleRepository.getIdByName(payload.role);
    const password_hash = await bcrypt.hash(payload.password, SALT_ROUNDS);

    const userId = await withTransaction(async (conn) => {
      const uid = await UserRepository.insert(conn, {
        name: payload.name,
        email: payload.email,
        password_hash,
        phone: payload.phone,
        language: payload.language,
        role_id: roleId,
      });
      if (payload.role === "client" && payload.client_profile) {
        const profileId = await ClientProfileRepository.insert(conn, {
          user_id: uid,
          contact_person: payload.client_profile.contact_person,
          billing_address: payload.client_profile.billing_address,
          ...(payload.client_profile.credits_terms_days !== undefined
            ? { credits_terms_days: payload.client_profile.credits_terms_days }
            : {}),
          ...(payload.client_profile.pricing_tier !== undefined
            ? { pricing_tier: payload.client_profile.pricing_tier }
            : {}),
        });
        for (const p of payload.properties ?? []) {
          const row: PropertyInsertInput = {
            user_id: uid,
            property_name: p.property_name,
            address: p.address,
            city: p.city,
            area: p.area,
            access_notes: p.access_notes ?? null,
            lat: p.lat ?? null,
            lng: p.lng ?? null,
          };
          await PropertyRepository.insert(conn, row);
        }
      }
      return uid;
    });

    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("Failed to retrieve created user", 500);
    return user;
  }
}
