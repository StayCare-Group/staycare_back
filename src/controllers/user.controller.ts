import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User";
import { sendSuccess, sendError } from "../utils/response";
import { parsePagination, paginationMeta } from "../utils/paginate";

const SALT_ROUNDS = 10;

export const createUser = async (req: Request, res: Response) => {
  try {
    const { password, ...rest } = req.body;
    
    if (!password) {
      return sendError(res, 400, "Password is required");
    }
    
    const existing = await User.findOne({ email: rest.email });
    if (existing) {
      return sendError(res, 409, "Email already in use");
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({ ...rest, password_hash });

    const { password_hash: _, refresh_token, ...safeUser } = user.toObject();
    return sendSuccess(res, 201, "User created", safeUser);
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 11000) {
      return sendError(res, 409, "Email or phone already in use");
    }
    
    // En desarrollo, mostrar el error real para debugging
    const isDev = process.env.NODE_ENV === "development";
    const errorMessage = error instanceof Error ? error.message : "User creation failed";
    
    console.error("User creation error:", error);
    
    return sendError(
      res,
      400,
      isDev ? errorMessage : "User creation failed"
    );
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { role, is_active } = req.query;
    const filter: Record<string, any> = {};
    if (role) filter.role = role;
    if (is_active !== undefined) filter.is_active = is_active === "true";

    const { page, limit, skip } = parsePagination(req);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password_hash -refresh_token")
        .populate("client")
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Users retrieved", users, paginationMeta(total, page, limit));
  } catch (error) {
    return sendError(res, 400, "Failed to fetch users");
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password_hash -refresh_token")
      .populate("client");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "User retrieved", user);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch user");
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { password, ...rest } = req.body;
    const updateData: Record<string, any> = { ...rest, updated_at: new Date() };

    if (password) {
      updateData.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).select("-password_hash -refresh_token");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "User updated", user);
  } catch (error) {
    return sendError(res, 400, "User update failed");
  }
};

export const deactivateUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { is_active: false, updated_at: new Date() },
      { new: true },
    ).select("-password_hash -refresh_token");

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return sendSuccess(res, 200, "User deactivated", user);
  } catch (error) {
    return sendError(res, 400, "User deactivation failed");
  }
};
