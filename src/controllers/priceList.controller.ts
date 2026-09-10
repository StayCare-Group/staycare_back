import { Request, Response } from "express";
import { PriceListService } from "../services/priceList.service";
import { AppError } from "../utils/AppError";
import { sendSuccess, sendError } from "../utils/response";

export const getClientPriceList = async (req: Request, res: Response) => {
  try {
    const list = await PriceListService.getClientAssignedPriceList(req.params.id as string);
    return sendSuccess(res, 200, "Client price list retrieved", list);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to retrieve client price list");
  }
};

export const setClientPriceList = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    
    if (items && Array.isArray(items)) {
      if (items.length === 0) {
        throw new AppError("The 'items' array cannot be empty", 400);
      }
      const result = await PriceListService.syncClientCustomPrices(req.params.id as string, items);
      return sendSuccess(res, 200, "Custom prices synced for client", result);
    } else {
      throw new AppError("You must provide an 'items' array", 400);
    }
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update client prices");
  }
};

export const bulkUpsertClientItems = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError("You must provide a non-empty 'items' array", 400);
    }
    
    const result = await PriceListService.upsertClientItems(clientId, items);
    return sendSuccess(res, 200, "Items added/updated successfully", result);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update items");
  }
};

export const bulkDeleteClientItems = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const { item_ids } = req.body;
    
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      throw new AppError("You must provide a non-empty 'item_ids' array", 400);
    }
    
    await PriceListService.deleteClientItems(clientId, item_ids);
    return sendSuccess(res, 200, "Items removed successfully");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to delete items");
  }
};

export const setClientSingleItemPrice = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const itemId = req.params.itemId as string;
    const { price } = req.body;
    
    if (price === undefined || price === null) {
      throw new AppError("You must provide a 'price'", 400);
    }
    
    const result = await PriceListService.setClientSingleItemPrice(clientId, itemId, Number(price));
    return sendSuccess(res, 200, "Item price updated for client", result);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to update single item price");
  }
};

export const removeClientPriceList = async (req: Request, res: Response) => {
  try {
    await PriceListService.removePriceListFromClient(req.params.id as string);
    return sendSuccess(res, 200, "Price list removed from client");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Failed to remove price list");
  }
};
