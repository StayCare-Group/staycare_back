import { describe, it, expect, vi, beforeEach } from "vitest";
import { PriceListService } from "../../../src/services/priceList.service";
import { PriceListRepository } from "../../../src/repositories/priceList.repository";
import { ItemRepository } from "../../../src/repositories/item.repository";
import pool from "../../../src/db/pool";

vi.mock("../../../src/repositories/priceList.repository");
vi.mock("../../../src/repositories/item.repository");

// Mock de la base de datos
vi.mock("../../../src/db/pool", () => {
  return {
    default: {
      getConnection: vi.fn().mockResolvedValue({
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
        execute: vi.fn().mockResolvedValue([[{ id: "client-1", name: "Client" }]]),
      }),
      execute: vi.fn().mockResolvedValue([[{ id: "client-1" }]])
    }
  };
});

describe("PriceListService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("upsertClientItems", () => {
    it("fails if attempting to add an item not in base catalog", async () => {
      vi.mocked(ItemRepository.findById).mockResolvedValueOnce(null);
      await expect(PriceListService.upsertClientItems("client-1", [{ item_id: "fake", price: 10 }]))
        .rejects.toThrow(/no existe en el catálogo/);
    });

    it("succeeds if all items exist", async () => {
      vi.mocked(ItemRepository.findById).mockResolvedValue({ id: "item-1" } as any);
      vi.mocked(PriceListRepository.findItemsByClientId).mockResolvedValueOnce([]);
      
      const res = await PriceListService.upsertClientItems("client-1", [{ item_id: "item-1", price: 10 }]);
      expect(PriceListRepository.upsertItem).toHaveBeenCalledWith("client-1", "item-1", 10, expect.anything());
      expect(res.items).toBeDefined();
    });
  });

  describe("deleteClientItems", () => {
    it("deletes items successfully", async () => {
      await PriceListService.deleteClientItems("client-1", ["item-1"]);
      expect(PriceListRepository.deleteItem).toHaveBeenCalledWith("client-1", "item-1", expect.anything());
    });
  });
});
