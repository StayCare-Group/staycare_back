import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricingService } from "../../../src/services/pricing.service";
import { ItemRepository } from "../../../src/repositories/item.repository";
import { PriceListRepository } from "../../../src/repositories/priceList.repository";

vi.mock("../../../src/repositories/item.repository");
vi.mock("../../../src/repositories/priceList.repository");

describe("PricingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("determineItemPrice", () => {
    it("returns basePrice if no customPrice is provided", () => {
      expect(PricingService.determineItemPrice(10)).toBe(10);
      expect(PricingService.determineItemPrice(10, null)).toBe(10);
      expect(PricingService.determineItemPrice(10, undefined)).toBe(10);
    });

    it("returns customPrice if provided", () => {
      expect(PricingService.determineItemPrice(10, 8)).toBe(8);
      expect(PricingService.determineItemPrice(10, 0)).toBe(0);
    });
  });

  describe("resolveItemPrice", () => {
    it("throws if item not found", async () => {
      vi.mocked(ItemRepository.findById).mockResolvedValueOnce(null);
      await expect(PricingService.resolveItemPrice("client-1", "item-1", 1)).rejects.toThrow(/not found/);
    });

    it("returns base_catalog if client has no custom price", async () => {
      vi.mocked(ItemRepository.findById).mockResolvedValueOnce({ id: "item-1", item_code: "I-1", name: "Item 1", base_price: 10 } as any);
      vi.mocked(PriceListRepository.findItemByClientAndItemId).mockResolvedValueOnce(null);

      const res = await PricingService.resolveItemPrice("client-1", "item-1", 2);
      expect(res.unit_price).toBe(10);
      expect(res.total_price).toBe(20);
      expect(res.source).toBe("base_catalog");
    });

    it("returns custom_price_list if item is in custom list", async () => {
      vi.mocked(ItemRepository.findById).mockResolvedValueOnce({ id: "item-1", item_code: "I-1", name: "Item 1", base_price: 10 } as any);
      vi.mocked(PriceListRepository.findItemByClientAndItemId).mockResolvedValueOnce({ price: 7 } as any);

      const res = await PricingService.resolveItemPrice("client-1", "item-1", 3);
      expect(res.unit_price).toBe(7);
      expect(res.total_price).toBe(21);
      expect(res.source).toBe("custom_price_list");
    });
  });

  describe("resolveOrderItemsPrices", () => {
    it("resolves batch of items handling mix of custom and base prices", async () => {
      vi.mocked(ItemRepository.findById).mockImplementation(async (id) => {
        if (id === "item-1") return { id: "item-1", item_code: "I-1", name: "Item 1", base_price: 10 } as any;
        if (id === "item-2") return { id: "item-2", item_code: "I-2", name: "Item 2", base_price: 20 } as any;
        return null;
      });

      vi.mocked(PriceListRepository.findItemByClientAndItemId).mockImplementation(async (cId, iId) => {
        if (iId === "item-1") return { price: 8 } as any;
        return null;
      });

      const items = [
        { item_id: "item-1", quantity: 2 },
        { item_id: "item-2", quantity: 1 }
      ];

      const res = await PricingService.resolveOrderItemsPrices("client-1", items);
      
      expect(res).toHaveLength(2);
      expect(res[0]!.unit_price).toBe(8);
      expect(res[0]!.source).toBe("custom_price_list");
      expect(res[1]!.unit_price).toBe(20);
      expect(res[1]!.source).toBe("base_catalog");
    });
  });
});
