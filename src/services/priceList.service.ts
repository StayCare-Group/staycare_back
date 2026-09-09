import { PriceListRepository } from "../repositories/priceList.repository";
import { ItemRepository } from "../repositories/item.repository";
import pool from "../db/pool";
import { AppError } from "../utils/AppError";

export class PriceListService {
  static async syncClientCustomPrices(clientId: string, items: { item_id: string; price: number }[]) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [users]: any = await conn.execute("SELECT id FROM users WHERE id = ?", [clientId]);
      if (users.length === 0) throw new AppError(`Client with ID ${clientId} not found`, 404);

      await PriceListRepository.deleteItemsByClientId(clientId, conn);

      for (const item of items) {
        const itemDef = await ItemRepository.findById(item.item_id);
        if (!itemDef) {
          throw new AppError(`Cannot set custom price: Item with ID ${item.item_id} does not exist in base catalog.`, 404);
        }
        await PriceListRepository.upsertItem(clientId, item.item_id, item.price, conn);
      }

      await conn.commit();
      return { items: await PriceListRepository.findItemsByClientId(clientId) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async setClientSingleItemPrice(clientId: string, itemId: string, price: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [users]: any = await conn.execute("SELECT id FROM users WHERE id = ?", [clientId]);
      if (users.length === 0) throw new AppError(`Client with ID ${clientId} not found`, 404);

      const itemDef = await ItemRepository.findById(itemId);
      if (!itemDef) {
        throw new AppError(`Item con ID ${itemId} no existe en el catálogo.`, 404);
      }

      await PriceListRepository.upsertItem(clientId, itemId, price, conn);

      await conn.commit();
      return await PriceListRepository.findItemByClientAndItemId(clientId, itemId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async upsertClientItems(clientId: string, items: { item_id: string; price: number }[]) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [users]: any = await conn.execute("SELECT id FROM users WHERE id = ?", [clientId]);
      if (users.length === 0) throw new AppError(`Client with ID ${clientId} not found`, 404);

      for (const item of items) {
        const itemDef = await ItemRepository.findById(item.item_id);
        if (!itemDef) {
          throw new AppError(`Item con ID ${item.item_id} no existe en el catálogo.`, 404);
        }
        await PriceListRepository.upsertItem(clientId, item.item_id, item.price, conn);
      }

      await conn.commit();
      return { items: await PriceListRepository.findItemsByClientId(clientId) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async deleteClientItems(clientId: string, itemIds: string[]) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [users]: any = await conn.execute("SELECT id FROM users WHERE id = ?", [clientId]);
      if (users.length === 0) throw new AppError(`Client with ID ${clientId} not found`, 404);

      for (const itemId of itemIds) {
        await PriceListRepository.deleteItem(clientId, itemId, conn);
      }

      await conn.commit();
      return { success: true };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async getClientAssignedPriceList(clientId: string) {
    const [users]: any = await pool.execute("SELECT id FROM users WHERE id = ?", [clientId]);
    if (users.length === 0) throw new AppError(`Client (user) with ID ${clientId} not found`, 404);
    
    const items = await PriceListRepository.findItemsByClientId(clientId);
    return items.length > 0 ? { items } : null;
  }

  static async removePriceListFromClient(clientId: string) {
    await PriceListRepository.deleteItemsByClientId(clientId);
  }
}
