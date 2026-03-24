import { Request, Response } from "express";
import Item from "../models/Items";
import { sendSuccess, sendError } from "../utils/response";

export const createItem = async (req: Request, res: Response) => {
  try {
    const existing = await Item.findOne({ item_code: req.body.item_code });
    if (existing) {
      return sendError(res, 409, "Item code already exists");
    }

    const item = await Item.create(req.body);
    return sendSuccess(res, 201, "Item created", item);
  } catch (error) {
    return sendError(res, 400, "Item creation failed");
  }
};

export const getAllItems = async (req: Request, res: Response) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;

    const items = await Item.find(filter).sort({ item_code: 1 });
    return sendSuccess(res, 200, "Items retrieved", items);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch items");
  }
};

export const getItemById = async (req: Request, res: Response) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return sendError(res, 404, "Item not found");
    }
    return sendSuccess(res, 200, "Item retrieved", item);
  } catch (error) {
    return sendError(res, 400, "Failed to fetch item");
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!item) {
      return sendError(res, 404, "Item not found");
    }
    return sendSuccess(res, 200, "Item updated", item);
  } catch (error) {
    return sendError(res, 400, "Item update failed");
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) {
      return sendError(res, 404, "Item not found");
    }
    return sendSuccess(res, 200, "Item deleted");
  } catch (error) {
    return sendError(res, 400, "Item deletion failed");
  }
};

export const seedItems = async (_req: Request, res: Response) => {
  try {
    const defaultItems = [
      { item_code: "BS-D", name: "Double Bed Sheet", base_price: 0 },
      { item_code: "BS-S", name: "Single Bed Sheet", base_price: 0 },
      { item_code: "DC-S", name: "Single Duvet Cover", base_price: 0 },
      { item_code: "DC-D", name: "Double Duvet Cover", base_price: 0 },
      { item_code: "BT", name: "Bath Towel", base_price: 0 },
      { item_code: "HT", name: "Hand Towel", base_price: 0 },
      { item_code: "FC", name: "Face Cloth", base_price: 0 },
      { item_code: "PC", name: "Pillow Case", base_price: 0 },
      { item_code: "BM", name: "Bath Mat", base_price: 0 },
      { item_code: "P", name: "Pillow", base_price: 0 },
      { item_code: "D", name: "Duvet", base_price: 0 },
    ];

    let created = 0;
    for (const item of defaultItems) {
      const existing = await Item.findOne({ item_code: item.item_code });
      if (!existing) {
        await Item.create(item);
        created++;
      }
    }

    return sendSuccess(res, 200, `Seeded ${created} items`);
  } catch (error) {
    return sendError(res, 400, "Seed failed");
  }
};
