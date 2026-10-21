/**
 * Box EV and grading stay on the five tool games.
 * The hype tracker also includes Magic, which already has a keyless catalog.
 * Sports stays on the main chase list only.
 */

export const TOOL_CATEGORY_IDS = [
  "pokemon",
  "one-piece",
  "lorcana",
  "riftbound",
  "gundam",
] as const;

export type ToolCategoryId = (typeof TOOL_CATEGORY_IDS)[number];

export const HYPE_CATEGORY_IDS = [...TOOL_CATEGORY_IDS, "mtg"] as const;

export type HypeCategoryId = (typeof HYPE_CATEGORY_IDS)[number];

export function isToolCategoryId(value: string): value is ToolCategoryId {
  return (TOOL_CATEGORY_IDS as readonly string[]).includes(value);
}

export function isHypeCategoryId(value: string): value is HypeCategoryId {
  return (HYPE_CATEGORY_IDS as readonly string[]).includes(value);
}
