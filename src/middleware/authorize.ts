import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../utils/jwt";

export const authorize =
  (...allowedRoles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Direct role match
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    // Sub-user of a client attempting to access a client route
    if (req.user.parentClientId && allowedRoles.includes("client")) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Forbidden",
    });
  };

export const authorizePermission =
  (permission: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Admin and staff bypass granular permissions
    if (req.user.role === "admin" || req.user.role === "staff") {
      return next();
    }

    // Main client account has full client permissions implicitly
    if (req.user.role === "client" && !req.user.parentClientId) {
      return next();
    }

    // Sub-users or custom roles check permissions array
    if (req.user.permissions && req.user.permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Forbidden: Missing required permission '${permission}'`,
    });
  };
