/**
 * Demo entitlements (localStorage only — no Stripe yet).
 *
 * Model:
 * - Premium $4.99 — full chase + entire set within owned categories.
 *   Pokémon counts as owned for Premium holders (and free users still get top-3 chase).
 * - Category add-on $2.99 each — one-piece | mtg | sports
 * - All Access $29.99 — all live categories (+ treat as owning those add-ons)
 *
 * Freemium browse: live categories (Pokémon, One Piece) allow free top-3 chase.
 * Full depth for One Piece requires Premium + one-piece add-on, or All Access.
 *
 * Migrates legacy `chase-cards-premium` === "1" into the new store.
 */

import {
  ADDON_CATEGORY_IDS,
  type CategoryId,
  getCategory,
  isLiveCategory,
} from "@/lib/catalog/types";

export const LEGACY_PREMIUM_STORAGE_KEY = "chase-cards-premium";
export const ENTITLEMENTS_STORAGE_KEY = "chase-cards-entitlements";

export const PREMIUM_PRICE_LABEL = "$4.99";
export const ADDON_PRICE_LABEL = "$2.99";
export const ALL_ACCESS_PRICE_LABEL = "$29.99";
export const FREE_CHASE_LIMIT = 3;

export type EntitlementsState = {
  premium: boolean;
  allAccess: boolean;
  /** Owned category add-ons (never includes pokemon — Premium covers it) */
  categories: CategoryId[];
};

export const EMPTY_ENTITLEMENTS: EntitlementsState = {
  premium: false,
  allAccess: false,
  categories: [],
};

function normalizeCategories(raw: unknown): CategoryId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ADDON_CATEGORY_IDS);
  const out: CategoryId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && allowed.has(item) && !out.includes(item as CategoryId)) {
      out.push(item as CategoryId);
    }
  }
  return out;
}

export function parseEntitlements(raw: string | null): EntitlementsState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EntitlementsState>;
    return {
      premium: Boolean(parsed.premium),
      allAccess: Boolean(parsed.allAccess),
      categories: normalizeCategories(parsed.categories),
    };
  } catch {
    return null;
  }
}

/** Read entitlements; migrate legacy premium flag once if needed. */
export function readEntitlements(): EntitlementsState {
  if (typeof window === "undefined") return { ...EMPTY_ENTITLEMENTS };

  try {
    const fromNew = parseEntitlements(
      window.localStorage.getItem(ENTITLEMENTS_STORAGE_KEY),
    );
    if (fromNew) {
      // Keep legacy key in sync for older tabs / demos
      if (fromNew.premium || fromNew.allAccess) {
        window.localStorage.setItem(LEGACY_PREMIUM_STORAGE_KEY, "1");
      }
      return fromNew;
    }

    const legacy = window.localStorage.getItem(LEGACY_PREMIUM_STORAGE_KEY) === "1";
    if (legacy) {
      const migrated: EntitlementsState = {
        premium: true,
        allAccess: false,
        categories: [],
      };
      writeEntitlements(migrated);
      return migrated;
    }
  } catch {
    /* ignore quota / private mode */
  }

  return { ...EMPTY_ENTITLEMENTS };
}

export function writeEntitlements(state: EntitlementsState): void {
  if (typeof window === "undefined") return;
  try {
    const normalized: EntitlementsState = {
      premium: Boolean(state.premium) || Boolean(state.allAccess),
      allAccess: Boolean(state.allAccess),
      categories: normalizeCategories(state.categories),
    };
    // All Access implies Premium + all live add-ons
    if (normalized.allAccess) {
      normalized.premium = true;
      for (const id of ADDON_CATEGORY_IDS) {
        if (isLiveCategory(id) && !normalized.categories.includes(id)) {
          normalized.categories.push(id);
        }
      }
    }
    window.localStorage.setItem(
      ENTITLEMENTS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    if (normalized.premium) {
      window.localStorage.setItem(LEGACY_PREMIUM_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(LEGACY_PREMIUM_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearEntitlements(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ENTITLEMENTS_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PREMIUM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Whether the user may use Premium depth (full chase + entire set)
 * for a category. Free Pokémon still works via FREE_CHASE_LIMIT.
 */
export function hasPremiumAccess(state: EntitlementsState): boolean {
  return state.premium || state.allAccess;
}

/**
 * Whether the user owns a category for full (paid) depth.
 * - Pokémon: always "owned" (Premium alone unlocks full Pokémon depth)
 * - One Piece / others: add-on in `categories`, or All Access
 * Free users may still browse live catalogs with FREE_CHASE_LIMIT (top 3).
 */
export function ownsCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (categoryId === "pokemon") return true;
  if (state.allAccess) return true;
  return state.categories.includes(categoryId);
}

/**
 * Full chase + entire set for a live category.
 * - Pokémon: Premium (or All Access)
 * - One Piece: Premium + one-piece add-on, or All Access
 * Free users: false → top-3 chase only on live catalogs.
 */
export function hasFullAccessInCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (!isLiveCategory(categoryId)) return false;
  if (!hasPremiumAccess(state)) return false;
  if (categoryId === "pokemon") return true;
  return ownsCategory(state, categoryId);
}

export function unlockPremiumState(
  prev: EntitlementsState,
): EntitlementsState {
  return { ...prev, premium: true };
}

export function unlockAddonState(
  prev: EntitlementsState,
  categoryId: CategoryId,
): EntitlementsState {
  if (categoryId === "pokemon") return prev;
  if (prev.categories.includes(categoryId)) return prev;
  return {
    ...prev,
    categories: [...prev.categories, categoryId],
  };
}

export function unlockAllAccessState(): EntitlementsState {
  return {
    premium: true,
    allAccess: true,
    // Coming-soon add-ons are still marked entitled for CTA messaging
    categories: [...ADDON_CATEGORY_IDS],
  };
}

export function entitlementBadgeLabel(state: EntitlementsState): string | null {
  if (state.allAccess) return "All Access";
  if (state.premium) return "Premium";
  return null;
}

export function categoryEntitlementHint(
  state: EntitlementsState,
  categoryId: CategoryId,
): "live" | "entitled_coming_soon" | "locked_coming_soon" {
  const cat = getCategory(categoryId);
  if (cat.status === "live") return "live";
  if (ownsCategory(state, categoryId)) return "entitled_coming_soon";
  return "locked_coming_soon";
}
