import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "../../services/order.service";
import { PricingService } from "../../services/pricing.service";
import { ItemRepository } from "../../repositories/item.repository";

// Test inner private calculateTotals by accessing it as any
const calculateTotals = (OrderService as any).calculateTotals.bind(OrderService);

vi.mock("../../services/pricing.service", () => ({
  PricingService: {
    resolveOrderItemsPrices: vi.fn(),
  }
}));

vi.mock("../../repositories/item.repository", () => ({
  ItemRepository: {
    findById: vi.fn(),
  }
}));

describe("OrderService.calculateTotals (Pricing Integration & Freezing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves prices using PricingService for new items", async () => {
    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-1",
        item_code: "I-1",
        name: "Item 1",
        unit_price: 12,
        total_price: 24,
        quantity: 2,
        source: "custom_price_list"
      }
    ]);

    const res = await calculateTotals(
      [{ item_id: "item-1", quantity: 2 }],
      "standard",
      "client-1",
      [] // No existing items
    );

    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", [{ item_id: "item-1", quantity: 2 }]);
    expect(res.calculatedItems).toHaveLength(1);
    expect(res.calculatedItems[0].unit_price).toBe(12);
  });

  it("freezes prices for existing items and does not call PricingService for them", async () => {
    vi.mocked(ItemRepository.findById).mockResolvedValue({
      id: "item-1",
      item_code: "I-1",
      name: "Item 1",
      base_price: 20
    } as any);

    // Provide an empty array for new items resolution
    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([]);

    const res = await calculateTotals(
      [{ item_id: "item-1", quantity: 5 }],
      "standard",
      "client-1",
      [{ item_id: "item-1", unit_price: 8.5 }] // Existing item with frozen price 8.5
    );

    // It should NOT resolve items again, so it resolves empty array
    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", []);
    expect(res.calculatedItems).toHaveLength(1);
    // Preserves the frozen 8.5 price instead of anything from PricingService or ItemRepository
    expect(res.calculatedItems[0].unit_price).toBe(8.5);
    expect(res.calculatedItems[0].total_price).toBe(42.5); // 8.5 * 5
  });

  it("mixes frozen and new items correctly", async () => {
    vi.mocked(ItemRepository.findById).mockImplementation(async (id) => {
      if (id === "item-old") return { id: "item-old", item_code: "OLD", name: "Old", base_price: 20 } as any;
      return null;
    });

    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-new",
        item_code: "NEW",
        name: "New",
        unit_price: 15, // new resolved price
        total_price: 15,
        quantity: 1,
        source: "base_catalog"
      }
    ]);

    const res = await calculateTotals(
      [
        { item_id: "item-old", quantity: 2 },
        { item_id: "item-new", quantity: 1 }
      ],
      "standard",
      "client-1",
      [{ item_id: "item-old", unit_price: 5 }] // Frozen old item
    );

    // Only new item was sent to resolve
    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", [{ item_id: "item-new", quantity: 1 }]);
    
    const oldItem = res.calculatedItems.find((i: any) => i.item_id === "item-old");
    const newItem = res.calculatedItems.find((i: any) => i.item_id === "item-new");

    expect(oldItem.unit_price).toBe(5);
    expect(newItem.unit_price).toBe(15);
  });
});
