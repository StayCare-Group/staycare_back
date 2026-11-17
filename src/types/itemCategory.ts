export const ITEM_CATEGORIES = [
  "sheets",
  "covers",
  "towels",
  "pillow_cases",
  "others",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const DEFAULT_ITEM_CATEGORY: ItemCategory = "others";

export function isItemCategory(value: unknown): value is ItemCategory {
  return typeof value === "string" && (ITEM_CATEGORIES as readonly string[]).includes(value);
}

