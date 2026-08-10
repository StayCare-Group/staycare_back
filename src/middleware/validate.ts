import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

export const validate =
  (schema: z.ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      if (parsed.body !== undefined) req.body = parsed.body as Request["body"];
      if (parsed.query !== undefined) req.query = parsed.query as Request["query"];
      if (parsed.params !== undefined) req.params = parsed.params as Request["params"];

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation failed. Please complete all required fields.",
          data: error.issues,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Unknown validation error",
      });
    }
  };
