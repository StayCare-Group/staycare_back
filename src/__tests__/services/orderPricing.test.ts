import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService } from "../../services/order.service";
import { PricingService } from "../../services/pricing.service";
import { ItemRepository } from "../../repositories/item.repository";
import { ClientProfileRepository } from "../../repositories/clientProfile.repository";

// Test inner private calculateTotals by accessing it as any
const calculateTotals = (OrderService as any).calculateTotals.bind(OrderService);

vi.mock("../../services/pricing.service", () => ({
  PricingService: {
    resolveOrderItemsPrices: vi.fn(),
    shouldApplyVat: (source: string, applyVat: boolean) => source !== "base_catalog" && Boolean(applyVat),
  }
}));

vi.mock("../../repositories/item.repository", () => ({
  ItemRepository: {
    findById: vi.fn(),
  }
}));

vi.mock("../../repositories/clientProfile.repository", () => ({
  ClientProfileRepository: {
    findByUserId: vi.fn(),
  }
}));

describe("OrderService.calculateTotals (Pricing Integration & Freezing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves prices using PricingService for new items", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce({
      user_id: "client-1",
      contact_person: "Client",
      vat_number: "VAT1",
      billing_address: "Addr",
      credits_terms_days: 30,
      pricing_tier: "standard",
      apply_vat_to_custom_prices: true,
    });

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

    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", [{ item_id: "item-1", quantity: 2 }], undefined);
    expect(res.calculatedItems).toHaveLength(1);
    expect(res.calculatedItems[0].unit_price).toBe(12);
  });

  it("freezes prices for existing items and does not call PricingService for them", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce(null);

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
    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", [], undefined);
    expect(res.calculatedItems).toHaveLength(1);
    // Preserves the frozen 8.5 price instead of anything from PricingService or ItemRepository
    expect(res.calculatedItems[0].unit_price).toBe(8.5);
    expect(res.calculatedItems[0].total_price).toBe(42.5); // 8.5 * 5
  });

  it("mixes frozen and new items correctly", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce(null);

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
    expect(PricingService.resolveOrderItemsPrices).toHaveBeenCalledWith("client-1", [{ item_id: "item-new", quantity: 1 }], undefined);
    
    const oldItem = res.calculatedItems.find((i: any) => i.item_id === "item-old");
    const newItem = res.calculatedItems.find((i: any) => i.item_id === "item-new");

    expect(oldItem.unit_price).toBe(5);
    expect(newItem.unit_price).toBe(15);
  });
});

describe("OrderService.calculateTotals (VAT Rules for Base vs Custom Prices)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Example 1: client has NO custom prices (base catalog) -> VAT is already included, so 0 VAT added", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce({
      user_id: "client-1",
      contact_person: "Client",
      vat_number: "VAT1",
      billing_address: "Addr",
      credits_terms_days: 30,
      pricing_tier: "standard",
      apply_vat_to_custom_prices: false,
    });

    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-base",
        item_code: "BASE",
        name: "Base Item",
        unit_price: 10,
        total_price: 20,
        quantity: 2,
        source: "base_catalog"
      }
    ]);

    const res = await calculateTotals(
      [{ item_id: "item-base", quantity: 2 }],
      "standard",
      "client-1",
      []
    );

    expect(res.subtotal).toBe(20);
    expect(res.vatAmount).toBe(0);
    expect(res.vatPercentage).toBe(0);
    expect(res.total).toBe(20);
    expect(res.calculatedItems[0].vat_applied).toBe(false);
  });

  it("Example 2: client HAS custom prices AND apply_vat_to_custom_prices = true -> 18% VAT added to custom prices", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce({
      user_id: "client-custom-vat",
      contact_person: "Custom Client",
      vat_number: "VAT2",
      billing_address: "Addr",
      credits_terms_days: 30,
      pricing_tier: "standard",
      apply_vat_to_custom_prices: true,
    });

    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-custom",
        item_code: "CUST",
        name: "Custom Item",
        unit_price: 50,
        total_price: 100, // 50 * 2
        quantity: 2,
        source: "custom_price_list"
      }
    ]);

    const res = await calculateTotals(
      [{ item_id: "item-custom", quantity: 2 }],
      "standard",
      "client-custom-vat",
      []
    );

    expect(res.subtotal).toBe(100);
    expect(res.vatPercentage).toBe(18);
    expect(res.vatAmount).toBe(18); // 18% of 100
    expect(res.total).toBe(118);
    expect(res.calculatedItems[0].vat_applied).toBe(true);
  });

  it("Example 3: client HAS custom prices BUT apply_vat_to_custom_prices = false -> 0 VAT added", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce({
      user_id: "client-custom-novat",
      contact_person: "Custom Client No VAT",
      vat_number: "VAT3",
      billing_address: "Addr",
      credits_terms_days: 30,
      pricing_tier: "standard",
      apply_vat_to_custom_prices: false,
    });

    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-custom",
        item_code: "CUST",
        name: "Custom Item",
        unit_price: 50,
        total_price: 100,
        quantity: 2,
        source: "custom_price_list"
      }
    ]);

    const res = await calculateTotals(
      [{ item_id: "item-custom", quantity: 2 }],
      "standard",
      "client-custom-novat",
      []
    );

    expect(res.subtotal).toBe(100);
    expect(res.vatAmount).toBe(0);
    expect(res.vatPercentage).toBe(0);
    expect(res.total).toBe(100);
    expect(res.calculatedItems[0].vat_applied).toBe(false);
  });

  it("Mixed items: apply_vat_to_custom_prices = true applies 18% VAT ONLY to the custom price items, not to base catalog items", async () => {
    vi.mocked(ClientProfileRepository.findByUserId).mockResolvedValueOnce({
      user_id: "client-mixed",
      contact_person: "Mixed Client",
      vat_number: "VAT4",
      billing_address: "Addr",
      credits_terms_days: 30,
      pricing_tier: "standard",
      apply_vat_to_custom_prices: true,
    });

    vi.mocked(PricingService.resolveOrderItemsPrices).mockResolvedValueOnce([
      {
        item_id: "item-base",
        item_code: "BASE",
        name: "Base Item",
        unit_price: 10,
        total_price: 20, // 10 * 2 (No VAT: base catalog includes VAT)
        quantity: 2,
        source: "base_catalog"
      },
      {
        item_id: "item-custom",
        item_code: "CUST",
        name: "Custom Item",
        unit_price: 50,
        total_price: 50, // 50 * 1 (VAT applies: 50 * 0.18 = 9)
        quantity: 1,
        source: "custom_price_list"
      }
    ]);

    const res = await calculateTotals(
      [
        { item_id: "item-base", quantity: 2 },
        { item_id: "item-custom", quantity: 1 }
      ],
      "standard",
      "client-mixed",
      []
    );

    expect(res.subtotal).toBe(70);
    expect(res.vatPercentage).toBe(18);
    expect(res.vatAmount).toBe(9); // 18% of 50 only!
    expect(res.total).toBe(79); // 70 + 9
    expect(res.calculatedItems.find((i: any) => i.item_id === "item-base")?.vat_applied).toBe(false);
    expect(res.calculatedItems.find((i: any) => i.item_id === "item-custom")?.vat_applied).toBe(true);
  });
});
