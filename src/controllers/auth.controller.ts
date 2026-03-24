import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User";
import PasswordReset, { generateResetToken } from "../models/PasswordReset";
import { sendPasswordResetEmail } from "../utils/mail";
import type { UserRole } from "../utils/jwt";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from "../utils/jwt";
import { sendSuccess, sendError } from "../utils/response";

const SALT_ROUNDS = 10;

const toTokenRole = (role: string): UserRole =>
  (["admin", "client", "driver", "staff"].includes(role)
    ? role
    : "client") as UserRole;

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, language, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return sendError(res, 409, "Email already in use");
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      name,
      email,
      password_hash,
      phone,
      language,
      role: role || "client",
    });

    const tokenRole = toTokenRole(user.role);

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

    return sendSuccess(res, 201, "Registration successful", {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 11000) {
      return sendError(res, 409, "Email or phone already in use");
    }
    
    const isDev = process.env.NODE_ENV === "development";
    const errorMessage = error instanceof Error ? error.message : "Registration failed";
    
    console.error("Registration error:", error);
    
    return sendError(
      res,
      400,
      isDev ? errorMessage : "Registration failed"
    );
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log(email, password);
    const user = await User.findOne({ email }).select(
      "+password_hash +refresh_token",
    );
    console.log(user);
    if (!user) {
      return sendError(res, 401, "Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    console.log(isPasswordValid);
    if (!isPasswordValid) {
      return sendError(res, 401, "Invalid credentials");
    }

    const tokenRole = toTokenRole(user.role);

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

    return sendSuccess(res, 200, "Login successful", {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error) {
    return sendError(res, 400, "Login failed");
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;

    if (!token) {
      return sendError(res, 401, "Refresh token missing");
    }

    const decoded = verifyRefreshToken(token);

    const user = await User.findById(decoded.userId).select(
      "role email name language refresh_token",
    );

    if (!user || user.refresh_token !== token) {
      return sendError(res, 401, "Invalid refresh token");
    }

    const tokenRole = toTokenRole(user.role);

    const accessToken = signAccessToken({
      userId: user._id.toString(),
      role: tokenRole,
    });

    res.cookie("accessToken", accessToken, getAccessTokenCookieOptions());

    return sendSuccess(res, 200, "Token refreshed", {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
      },
    });
  } catch (error) {
    return sendError(res, 401, "Could not refresh access token");
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.userId)
      .select("-password_hash -refresh_token")
      .populate("client");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "Current user", { user });
  } catch (error) {
    return sendError(res, 400, "Failed to fetch user");
  }
};

export const updateMe = async (req: Request, res: Response) => {
  try {
    const allowedFields = ["name", "email", "phone", "language"];
    const updateData: Record<string, any> = { updated_at: new Date() };

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user!.userId,
      updateData,
      { new: true },
    ).select("-password_hash -refresh_token");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "Profile updated", { user });
  } catch (error) {
    return sendError(res, 400, "Profile update failed");
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;

    const user = await User.findById(req.user!.userId).select("+password_hash");
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return sendError(res, 401, "Current password is incorrect");
    }

    user.password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await user.save();

    return sendSuccess(res, 200, "Password changed successfully");
  } catch (error) {
    return sendError(res, 400, "Password change failed");
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return sendError(res, 400, "Email is required");

    const user = await User.findOne({ email });
    if (!user) {
      return sendSuccess(res, 200, "If that email exists, a reset link has been sent");
    }

    const token = generateResetToken();
    const expires_at = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordReset.create({ email, token, expires_at });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const resetUrl = `${clientUrl}/reset-password/${token}`;

    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch {
      console.error("Failed to send password reset email");
    }

    return sendSuccess(res, 200, "If that email exists, a reset link has been sent", {
      reset_url: process.env.NODE_ENV === "development" ? resetUrl : undefined,
    });
  } catch (error) {
    return sendError(res, 500, "Password reset request failed");
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const { password } = req.body;

    if (typeof token !== "string") {
      return sendError(res, 400, "Reset token is required");
    }

    if (!password || password.length < 6) {
      return sendError(res, 400, "Password must be at least 6 characters");
    }

    const resetRecord = await PasswordReset.findOne({
      token,
      used: false,
      expires_at: { $gt: new Date() },
    });

    if (!resetRecord) {
      return sendError(res, 400, "Invalid or expired reset link");
    }

    const user = await User.findOne({ email: resetRecord.email });
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    user.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    await user.save();

    resetRecord.used = true;
    await resetRecord.save();

    return sendSuccess(res, 200, "Password has been reset. You can now log in.");
  } catch (error) {
    return sendError(res, 500, "Password reset failed");
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;

    if (token) {
      await User.updateOne(
        { refresh_token: token },
        { $unset: { refresh_token: "" } },
      );
    }

    res
      .clearCookie("accessToken", getClearCookieOptions())
      .clearCookie("refreshToken", getClearCookieOptions());

    return sendSuccess(res, 200, "Logged out");
  } catch (error) {
    return sendError(res, 400, "Logout failed");
  }
};
