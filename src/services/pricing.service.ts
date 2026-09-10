import { ItemRepository } from "../repositories/item.repository";
import { PriceListRepository } from "../repositories/priceList.repository";
import { AppError } from "../utils/AppError";
import pool from "../db/pool";

export interface ResolvedItemPrice {
  item_id: string;
  item_code: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  source: "base_catalog" | "custom_price_list";
}

export class PricingService {
  static determineItemPrice(basePrice: number, customPrice?: number | null): number {
    return customPrice !== undefined && customPrice !== null ? customPrice : basePrice;
  }

  static async resolveItemPrice(clientId: string, itemId: string, quantity: number, connection?: any): Promise<ResolvedItemPrice> {
    const itemDef = await ItemRepository.findById(itemId);
    if (!itemDef) {
      throw new AppError(`Item with ID ${itemId} not found.`, 404);
    }

    const basePrice = Number(itemDef.base_price);
    const customPriceDef = await PriceListRepository.findItemByClientAndItemId(clientId, itemId, connection);
    
    const customPrice = customPriceDef ? Number(customPriceDef.price) : null;
    const finalPrice = this.determineItemPrice(basePrice, customPrice);

    return {
      item_id: itemId,
      item_code: itemDef.item_code,
      name: itemDef.name,
      quantity,
      unit_price: finalPrice,
      total_price: finalPrice * quantity,
      source: customPrice !== null ? "custom_price_list" : "base_catalog"
    };
  }

  static async resolveOrderItemsPrices(clientId: string, items: { item_id: string; quantity: number }[], connection?: any): Promise<ResolvedItemPrice[]> {
    const resolvedItems: ResolvedItemPrice[] = [];
    for (const item of items) {
      const resolved = await this.resolveItemPrice(clientId, item.item_id, item.quantity, connection);
      resolvedItems.push(resolved);
    }
    return resolvedItems;
  }
}
