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
        throw new AppError("No puedes enviar un arreglo de 'items' vacío", 400);
      }
      const result = await PriceListService.syncClientCustomPrices(req.params.id as string, items);
      return sendSuccess(res, 200, "Custom prices synced for client", result);
    } else {
      throw new AppError("Debes proporcionar un arreglo de 'items'", 400);
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
      throw new AppError("Debes proporcionar un arreglo de 'items' que no esté vacío", 400);
    }
    
    const result = await PriceListService.upsertClientItems(clientId, items);
    return sendSuccess(res, 200, "Ítems agregados/actualizados correctamente", result);
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Falló la actualización de los ítems");
  }
};

export const bulkDeleteClientItems = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const { item_ids } = req.body;
    
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      throw new AppError("Debes proporcionar un arreglo de 'item_ids' que no esté vacío", 400);
    }
    
    await PriceListService.deleteClientItems(clientId, item_ids);
    return sendSuccess(res, 200, "Ítems eliminados correctamente");
  } catch (error: any) {
    if (error instanceof AppError) return sendError(res, error.statusCode, error.message);
    return sendError(res, 400, "Falló la eliminación de los ítems");
  }
};

export const setClientSingleItemPrice = async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id as string;
    const itemId = req.params.itemId as string;
    const { price } = req.body;
    
    if (price === undefined || price === null) {
      throw new AppError("Debes proporcionar el 'price'", 400);
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
