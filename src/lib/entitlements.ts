/**
 * Entitlements (localStorage; Stripe Checkout grants via confirm).
 *
 * Model:
 * - Premium $4.99 — full chase + entire set within owned categories.
 *   Pokémon counts as owned for Premium holders (and free users still get top-3 chase).
 * - Category add-on $1.99 each — one-piece | mtg | sports
 * - Per-sport add-ons — baseball | basketball | football | hockey | soccer
 *   (generic `sports` category stays coming_soon until Phase sports adapters exist)
 * - All Access $29.99 — all live categories + all sport add-ons
 *
 * Migrates legacy `chase-cards-premium` === "1" into the new store.
 */

import {
  ADDON_CATEGORY_IDS,
  type CategoryId,
  getCategory,
  isLiveCategory,
} from "@/lib/catalog/types";
import {
  SPORT_ADDON_IDS,
  sportIdFromEntitlement,
  type CheckoutEntitlementKey,
  type SportAddonId,
} from "@/lib/stripe/catalog";

export const LEGACY_PREMIUM_STORAGE_KEY = "chase-cards-premium";
export const ENTITLEMENTS_STORAGE_KEY = "chase-cards-entitlements";

export const PREMIUM_PRICE_LABEL = "$4.99";
export const ADDON_PRICE_LABEL = "$1.99";
export const ALL_ACCESS_PRICE_LABEL = "$29.99";
export const FREE_CHASE_LIMIT = 3;

export type EntitlementsState = {
  premium: boolean;
  allAccess: boolean;
  /** Owned category add-ons (never includes pokemon — Premium covers it) */
  categories: CategoryId[];
  /** Per-sport add-ons for future sports adapters */
  sports: SportAddonId[];
};

export const EMPTY_ENTITLEMENTS: EntitlementsState = {
  premium: false,
  allAccess: false,
  categories: [],
  sports: [],
};

function normalizeCategories(raw: unknown): CategoryId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ADDON_CATEGORY_IDS);
  const out: CategoryId[] = [];
  for (const item of raw) {
    if (
      typeof item === "string" &&
      allowed.has(item) &&
      !out.includes(item as CategoryId)
    ) {
      out.push(item as CategoryId);
    }
  }
  return out;
}

function normalizeSports(raw: unknown): SportAddonId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(SPORT_ADDON_IDS);
  const out: SportAddonId[] = [];
  for (const item of raw) {
    if (
      typeof item === "string" &&
      allowed.has(item) &&
      !out.includes(item as SportAddonId)
    ) {
      out.push(item as SportAddonId);
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
      sports: normalizeSports(parsed.sports),
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
        sports: [],
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
      sports: normalizeSports(state.sports),
    };
    // All Access implies Premium + all category add-ons + all sport add-ons
    if (normalized.allAccess) {
      normalized.premium = true;
      for (const id of ADDON_CATEGORY_IDS) {
        if (!normalized.categories.includes(id)) {
          normalized.categories.push(id);
        }
      }
      for (const id of SPORT_ADDON_IDS) {
        if (!normalized.sports.includes(id)) {
          normalized.sports.push(id);
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
 * Whether the user owns a category for selection / future catalog access.
 * - Pokémon: always "owned" for browsing (freemium depth applies separately)
 * - Others: add-on in `categories`, or All Access
 * - Sports: category add-on OR any per-sport add-on (reserves sports chip entitlement)
 */
export function ownsCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (categoryId === "pokemon") return true;
  if (state.allAccess) return true;
  if (state.categories.includes(categoryId)) return true;
  if (categoryId === "sports" && state.sports.length > 0) return true;
  return false;
}

export function ownsSport(
  state: EntitlementsState,
  sportId: SportAddonId,
): boolean {
  if (state.allAccess) return true;
  if (state.categories.includes("sports")) return true;
  return state.sports.includes(sportId);
}

/**
 * Premium depth for Pokémon (or a live owned category later).
 * Free users: false → top-3 chase only on Pokémon.
 */
export function hasFullAccessInCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (!hasPremiumAccess(state)) return false;
  if (categoryId === "pokemon") return true;
  return ownsCategory(state, categoryId) && isLiveCategory(categoryId);
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

export function unlockSportState(
  prev: EntitlementsState,
  sportId: SportAddonId,
): EntitlementsState {
  if (prev.sports.includes(sportId)) return prev;
  return {
    ...prev,
    sports: [...prev.sports, sportId],
  };
}

export function unlockAllAccessState(): EntitlementsState {
  return {
    premium: true,
    allAccess: true,
    // Coming-soon add-ons are still marked entitled for CTA messaging
    categories: [...ADDON_CATEGORY_IDS],
    sports: [...SPORT_ADDON_IDS],
  };
}

/**
 * Apply one or more Stripe-confirmed entitlement keys onto local state.
 */
export function applyCheckoutEntitlements(
  prev: EntitlementsState,
  keys: CheckoutEntitlementKey[],
): EntitlementsState {
  let next = { ...prev, categories: [...prev.categories], sports: [...prev.sports] };
  for (const key of keys) {
    if (key === "premium") {
      next = unlockPremiumState(next);
      continue;
    }
    if (key === "all_access") {
      next = unlockAllAccessState();
      continue;
    }
    if (key === "one-piece" || key === "mtg" || key === "sports") {
      next = unlockAddonState(next, key);
      continue;
    }
    const sport = sportIdFromEntitlement(key);
    if (sport) {
      next = unlockSportState(next, sport);
    }
  }
  return next;
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

export type { SportAddonId, CheckoutEntitlementKey };
