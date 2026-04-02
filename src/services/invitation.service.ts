import pool from "../db/pool";
import { InvitationRepository } from "../repositories/invitation.repository";
import { UserRepository } from "../repositories/user.repository";
import { RoleRepository } from "../repositories/role.repository";
import { generateInviteToken } from "../utils/crypto";
import { sendInvitationEmail } from "../utils/mail";
import { AppError } from "../utils/AppError";
import {
  signAccessToken,
  signRefreshToken,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
} from "../utils/jwt";
import type { UserRole } from "../utils/jwt";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
const INVITE_EXPIRY_HOURS = 24;

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";

export class InvitationService {
  static async createInvitation(
    email: string,
    role: "admin" | "staff" | "driver",
    createdByUserId: number
  ) {
    // Check if user already exists
    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      throw new AppError("El correo electrónico ya está registrado en el sistema", 409);
    }

    // Check for pending and not expired invitations
    const pendingInvites = await InvitationRepository.findPendingByEmail(email);
    if (pendingInvites.length > 0) {
      throw new AppError("Ya existe una invitación pendiente y activa para este correo electrónico", 400);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Invalidate prior pending invitations for this email
      await InvitationRepository.invalidatePendingByEmail(conn, email);

      const token = generateInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

      const id = await InvitationRepository.insert(conn, {
        token,
        email,
        role,
        created_by: createdByUserId,
        expires_at: expiresAt,
      });

      await conn.commit();

      const inviteUrl = `${clientUrl()}/invite/${token}`;
      let emailSent = true;

      try {
        await sendInvitationEmail(email, role, inviteUrl);
      } catch {
        emailSent = false;
      }

      return {
        emailSent,
        invitation: {
          id,
          email,
          role,
          expires_at: expiresAt,
          invite_url: emailSent ? undefined : inviteUrl,
        },
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async validateInvitation(token: string) {
    const invitation = await InvitationRepository.findByToken(token);

    if (!invitation || invitation.used) {
      throw new AppError("Invitation not found or already used", 404);
    }

    if (invitation.expires_at < new Date()) {
      throw new AppError("Invitation has expired", 410);
    }

    return {
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expires_at,
    };
  }

  static async registerViaInvitation(
    token: string,
    data: { name: string; password: string; phone?: string; language?: "en" | "es" }
  ) {
    const invitation = await InvitationRepository.findByToken(token);

    if (!invitation || invitation.used) {
      throw new AppError("Invitation not found or already used", 404);
    }
    if (invitation.expires_at < new Date()) {
      throw new AppError("Invitation has expired", 410);
    }

    const existingUser = await UserRepository.findByEmail(invitation.email);
    if (existingUser) {
      throw new AppError("El correo electrónico ya está registrado en el sistema", 409);
    }

    const roleId = await RoleRepository.getIdByName(invitation.role as any);

    const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const userId = await UserRepository.insert(conn, {
        name: data.name,
        email: invitation.email,
        password_hash,
        phone: data.phone ?? null,
        language: data.language ?? "en",
        role_id: roleId,
        is_active: true,
      });

      await InvitationRepository.markUsed(conn, token);

      await conn.commit();

      // Issue tokens
      const tokenRole = invitation.role as UserRole;
      const accessToken = signAccessToken({ userId: String(userId), role: tokenRole });
      const refreshToken = signRefreshToken({ userId: String(userId) });

      await UserRepository.updateRefreshToken(userId, refreshToken);

      return {
        tokens: { accessToken, refreshToken },
        cookieOptions: {
          access: getAccessTokenCookieOptions(),
          refresh: getRefreshTokenCookieOptions(),
        },
        user: {
          id: userId,
          name: data.name,
          email: invitation.email,
          role: tokenRole,
          language: data.language ?? "en",
        },
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async listInvitations(
    limit: number,
    offset: number,
    filter: { status?: "pending" | "expired" | "used" | undefined; search?: string | undefined } = {}
  ) {
    const [invitations, total] = await Promise.all([
      InvitationRepository.findMany(limit, offset, filter),
      InvitationRepository.countMany(filter),
    ]);
    return { invitations, total };
  }
}
