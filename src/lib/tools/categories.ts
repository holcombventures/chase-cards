/**
 * Collector tools cover the live games that are in scope for this feature.
 * MTG and Sports stay on the main chase list only.
 */

export const TOOL_CATEGORY_IDS = [
  "pokemon",
  "one-piece",
  "lorcana",
  "riftbound",
  "gundam",
] as const;

export type ToolCategoryId = (typeof TOOL_CATEGORY_IDS)[number];

export function isToolCategoryId(value: string): value is ToolCategoryId {
  return (TOOL_CATEGORY_IDS as readonly string[]).includes(value);
}
