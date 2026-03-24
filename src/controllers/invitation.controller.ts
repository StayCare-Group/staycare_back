import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import Invitation from "../models/Invitation";
import User from "../models/User";
import { sendSuccess, sendError } from "../utils/response";
import { sendInvitationEmail } from "../utils/mail";
import type { UserRole } from "../utils/jwt";
import {
  signAccessToken,
  signRefreshToken,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
} from "../utils/jwt";

const SALT_ROUNDS = 10;

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";

export const createInvitation = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 409, "A user with this email already exists");
    }

    await Invitation.updateMany(
      { email, used: false },
      { $set: { used: true } },
    );

    const invitation = await Invitation.create({
      email,
      role,
      created_by: req.user!.userId,
    } as any);

    const inviteUrl = `${clientUrl()}/invite/${invitation.token}`;

    try {
      await sendInvitationEmail(email, role, inviteUrl);
    } catch (mailErr) {
      console.error("Failed to send invitation email:", mailErr);
      return sendSuccess(res, 201, "Invitation created but email failed to send. Share the link manually.", {
        invitation: {
          id: invitation._id,
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
          invite_url: inviteUrl,
        },
      });
    }

    return sendSuccess(res, 201, "Invitation sent", {
      invitation: {
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
      },
    });
  } catch (error) {
    return sendError(res, 400, "Failed to create invitation");
  }
};

export const validateInvitation = async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;

    const invitation = await Invitation.findOne({ token, used: false });

    if (!invitation) {
      return sendError(res, 404, "Invitation not found or already used");
    }

    if (invitation.expires_at < new Date()) {
      return sendError(res, 410, "Invitation has expired");
    }

    return sendSuccess(res, 200, "Invitation is valid", {
      invitation: {
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expires_at,
      },
    });
  } catch (error) {
    return sendError(res, 400, "Failed to validate invitation");
  }
};

export const registerViaInvitation = async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { name, password, phone, language } = req.body;

    const invitation = await Invitation.findOne({ token, used: false });

    if (!invitation) {
      return sendError(res, 404, "Invitation not found or already used");
    }

    if (invitation.expires_at < new Date()) {
      return sendError(res, 410, "Invitation has expired");
    }

    const existingUser = await User.findOne({ email: invitation.email });
    if (existingUser) {
      return sendError(res, 409, "A user with this email already exists");
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      name,
      email: invitation.email,
      password_hash,
      phone,
      language,
      role: invitation.role,
    });

    invitation.used = true;
    invitation.used_at = new Date();
    await invitation.save();

    const tokenRole = invitation.role as UserRole;

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: tokenRole,
    });

    const refreshToken = signRefreshToken({
      userId: user._id.toString(),
    });

    user.refresh_token = refreshToken;
    await user.save();

    res
      .cookie("accessToken", accessToken, getAccessTokenCookieOptions())
      .cookie("refreshToken", refreshToken, getRefreshTokenCookieOptions());

    return sendSuccess(res, 201, "Account created successfully", {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error) {
    return sendError(res, 400, "Registration failed");
  }
};

export const listInvitations = async (_req: Request, res: Response) => {
  try {
    const invitations = await Invitation.find()
      .sort({ expires_at: -1 })
      .limit(50)
      .populate("created_by", "name email");

    return sendSuccess(res, 200, "Invitations list", { invitations });
  } catch (error) {
    return sendError(res, 400, "Failed to fetch invitations");
  }
};
