import type { Request, Response, NextFunction } from "express";
import { authenticate } from "./authenticate";
import { authorize } from "./authorize";

/**
 * `POST /api/auth/register`: Requiere sesión de un usuario **admin**.
 * El registro público está deshabilitado para evitar altas directas sin autorización.
 */
const REGISTER_ROLES = ["client", "admin", "staff", "driver", "operator"] as const;

export const registerAuthGate = (req: Request, res: Response, next: NextFunction) => {
  const role = req.body?.role ?? "client";
  if (!(REGISTER_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    return res.status(403).json({
      success: false,
      message: "Public registration is disabled. Please contact an administrator.",
    });
  }

  authenticate(req, res, () => {
    authorize("admin")(req, res, next);
  });
};
