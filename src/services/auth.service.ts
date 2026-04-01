import bcrypt from "bcryptjs";
import { UserRepository, IUserMySQL } from "../repositories/user.repository";
import { ClientProfileRepository } from "../repositories/clientProfile.repository";
import { PasswordResetRepository } from "../repositories/passwordReset.repository";
import { AppError } from "../utils/AppError";
import { generateAuthTokens, AuthTokens } from "../utils/auth.helper";
import { UserRole } from "../utils/jwt";
import { generateResetToken } from "../utils/crypto";
import { sendPasswordResetEmail } from "../utils/mail";
import {
  UserRegistrationService,
  type RegisterClientPayload,
  type ClientProfileInput,
  type PropertyCreateRow,
} from "./userRegistration.service";
import type { RegisterRequestBody } from "../validation/user.validation";

const SALT_ROUNDS = 10;

const toTokenRole = (role: string): UserRole =>
  (["admin", "client", "driver", "staff"].includes(role)
    ? (role as UserRole)
    : "client");

export class AuthService {
  /** `client`: cookies + tokens. `admin` / `staff` / `driver`: solo admin autenticado; sin cookies para el usuario creado. */
  static async register(data: RegisterRequestBody): Promise<{ user: IUserMySQL; tokens: AuthTokens | null }> {
    const role = data.role ?? "client";
    if (role === "client") {
      const payload: RegisterClientPayload = {
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
        language: data.language,
        client_profile: data.client_profile! as ClientProfileInput,
      };
      if (data.properties !== undefined) {
        payload.properties = data.properties as PropertyCreateRow[];
      }
      const user = await UserRegistrationService.registerClient(payload);
      const tokens = generateAuthTokens(user.id!, toTokenRole(user.role!));
      await UserRepository.updateRefreshToken(user.id!, tokens.refreshToken);
      return { user, tokens };
    }

    const user = await UserRegistrationService.createUserAdmin({
      name: data.name,
      email: data.email,
      password: data.password,
      phone: data.phone,
      language: data.language,
      role,
    });
    return { user, tokens: null };
  }

  static async login(email: string, password: string): Promise<{ user: IUserMySQL; tokens: AuthTokens }> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new AppError("Invalid credentials", 401);
    }

    const tokens = generateAuthTokens(user.id!, toTokenRole(user.role!));
    await UserRepository.updateRefreshToken(user.id!, tokens.refreshToken);

    return { user, tokens };
  }

  static async refreshAccessToken(refreshToken: string): Promise<{ user: IUserMySQL; accessToken: string }> {
    const user = await UserRepository.findByRefreshToken(refreshToken);
    if (!user) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const tokens = generateAuthTokens(user.id!, toTokenRole(user.role!));
    // We only need the new access token
    
    return { user, accessToken: tokens.accessToken };
  }

  static async updateMe(
    userId: number,
    data: Partial<IUserMySQL> & { contact_person?: string; billing_address?: string }
  ): Promise<IUserMySQL> {
    await UserRepository.update(userId, data);

    const hasProfilePatch = data.contact_person !== undefined || data.billing_address !== undefined;
    if (hasProfilePatch) {
      const profile = await ClientProfileRepository.findByUserId(userId);
      if (profile?.id) {
        await ClientProfileRepository.update(profile.id, {
          ...(data.contact_person !== undefined ? { contact_person: data.contact_person } : {}),
          ...(data.billing_address !== undefined ? { billing_address: data.billing_address } : {}),
        });
      }
    }

    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  static async changePassword(userId: number, current: string, next: string): Promise<void> {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const isMatch = await bcrypt.compare(current, user.password_hash);
    if (!isMatch) throw new AppError("Current password is incorrect", 401);

    const password_hash = await bcrypt.hash(next, SALT_ROUNDS);
    await UserRepository.update(userId, { password_hash });
  }

  static async logout(userId: number): Promise<void> {
    await UserRepository.updateRefreshToken(userId, null);
  }

  static async requestPasswordReset(email: string): Promise<string | undefined> {
    const user = await UserRepository.findByEmail(email);
    if (!user) return undefined;

    const token = generateResetToken();
    const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetRepository.create({ email, token, expires_at });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientUrl}/reset-password/${token}`;

    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      console.error("Failed to send reset email:", err);
    }

    return process.env.NODE_ENV === "development" ? resetUrl : undefined;
  }

  static async resetPassword(token: string, password: string): Promise<void> {
    const resetRecord = await PasswordResetRepository.findActiveByToken(token);
    if (!resetRecord) {
      throw new AppError("Invalid or expired reset link", 400);
    }

    const user = await UserRepository.findByEmail(resetRecord.email);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await UserRepository.update(user.id!, { password_hash });
    await PasswordResetRepository.markAsUsed(resetRecord.id!);
  }
}
