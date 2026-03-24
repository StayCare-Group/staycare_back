import { type Request, type Response } from "express";
import { sendSuccess, sendError } from "../utils/response";

export const healthCheck = async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res, 200, "Server is running");
  } catch (error) {
    return sendError(res, 500, "Server is not running");
  }
};
