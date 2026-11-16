import { ItemRepository, type ItemInsertInput } from "../repositories/item.repository";
import { AppError } from "../utils/AppError";

export class ItemService {
  static async getAllItems(is_active?: boolean, limit?: number, offset?: number, search?: string) {
    const items = await ItemRepository.findAll(is_active, limit, offset, search);
    const total = await ItemRepository.count(is_active, search);
    return { items, total };
  }


  static async getItemById(id: string) {
    return await ItemRepository.findById(id);
  }

  static async createItem(data: ItemInsertInput) {
    const existing = await ItemRepository.findByCode(data.item_code);
    if (existing) {
      throw new Error("Item code already exists");
    }
    const id = await ItemRepository.insert(data);
    return await ItemRepository.findById(id);
  }

  static async updateItem(id: string, data: Partial<ItemInsertInput> & { is_active?: boolean }) {
    await ItemRepository.update(id, data);
    return await ItemRepository.findById(id);
  }


  static async deleteItem(id: string) {
    const item = await ItemRepository.findById(id);
    if (!item) throw new AppError("Item not found", 404);

    const activeOrderCount = await ItemRepository.countActiveOrdersUsingItem(id);
    if (activeOrderCount > 0) {
      throw new AppError(
        `Cannot delete item '${item.name}' because it is associated with ${activeOrderCount} order(s) currently in progress.`,
        409
      );
    }

    return await ItemRepository.delete(id);
  }

  static async seedItems() {
    const existingCount = (await ItemRepository.findAll()).length;
    if (existingCount > 0) return 0;

    const defaultItems: ItemInsertInput[] = [
      { item_code: "BS-D", name: "Double Bed Sheet", category: "sheets", base_price: 0 },
      { item_code: "BS-S", name: "Single Bed Sheet", category: "sheets", base_price: 0 },
      { item_code: "DC-S", name: "Single Duvet Cover", category: "covers", base_price: 0 },
      { item_code: "DC-D", name: "Double Duvet Cover", category: "covers", base_price: 0 },
      { item_code: "BT", name: "Bath Towel", category: "towels", base_price: 0 },
      { item_code: "HT", name: "Hand Towel", category: "towels", base_price: 0 },
      { item_code: "FC", name: "Face Cloth", category: "mats_and_cloths", base_price: 0 },
      { item_code: "PC", name: "Pillow Case", category: "others", base_price: 0 },
      { item_code: "BM", name: "Bath Mat", category: "mats_and_cloths", base_price: 0 },
      { item_code: "P", name: "Pillow", category: "others", base_price: 0 },
      { item_code: "D", name: "Duvet", category: "others", base_price: 0 },
    ];

    let created = 0;
    for (const item of defaultItems) {
      await ItemRepository.insert(item);
      created++;
    }
    return created;
  }
}
