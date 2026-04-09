import { ItemRepository, type ItemInsertInput } from "../repositories/item.repository";

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
    return await ItemRepository.delete(id);
  }

  static async seedItems() {
    const existingCount = (await ItemRepository.findAll()).length;
    if (existingCount > 0) return 0;

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
      await ItemRepository.insert(item);
      created++;
    }
    return created;
  }
}
