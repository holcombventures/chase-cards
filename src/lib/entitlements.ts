/**
 * Entitlements (localStorage; Stripe Checkout grants via confirm).
 *
 * Model:
 * - FREE: top 3 chase visible for EVERY live category (Pokémon AND One Piece).
 * - Premium $4.99 — buyer CHOOSES which single live category gets full unlock
 *   (premiumCategory). Other live categories stay top-3-only until add-on / All Access.
 * - Category add-on $2.99 — unlock full access on a live category they did NOT
 *   pick for Premium (including Pokémon when Premium chose One Piece).
 *   Coming-soon add-ons (mtg / sports) still reserve entitlement.
 * - Per-sport add-ons — baseball | basketball | football | hockey | soccer
 * - All Access $29.99 — unlocks all categories (no picker needed)
 *
 * Migration: stored premium without premiumCategory → premiumCategory "pokemon"
 * (grandfather old “Premium = Pokémon” buyers). Legacy chase-cards-premium → same.
 */

import {
  ADDON_CATEGORY_IDS,
  LIVE_CATALOG_IDS,
  type CategoryId,
  getCategory,
  isCategoryId,
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
export const ADDON_PRICE_LABEL = "$2.99";
export const ALL_ACCESS_PRICE_LABEL = "$29.99";
export const FREE_CHASE_LIMIT = 3;

/** Categories that may appear in entitlements.categories (add-ons), including Pokémon. */
const CATEGORY_ADDON_ALLOWED: readonly CategoryId[] = [
  "pokemon",
  "one-piece",
  "mtg",
  "sports",
];

export type EntitlementsState = {
  premium: boolean;
  allAccess: boolean;
  /** The one live category chosen at Premium purchase (null if none / All Access). */
  premiumCategory: CategoryId | null;
  /** Add-on unlocks (may include pokemon when Premium chose another live cat). */
  categories: CategoryId[];
  /** Per-sport add-ons for future sports adapters */
  sports: SportAddonId[];
};

export const EMPTY_ENTITLEMENTS: EntitlementsState = {
  premium: false,
  allAccess: false,
  premiumCategory: null,
  categories: [],
  sports: [],
};

function normalizeCategories(raw: unknown): CategoryId[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(CATEGORY_ADDON_ALLOWED);
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

function normalizePremiumCategory(
  raw: unknown,
  premium: boolean,
): CategoryId | null {
  if (typeof raw === "string" && isCategoryId(raw) && isLiveCategory(raw)) {
    return raw;
  }
  // Migrate: premium with missing/invalid premiumCategory → grandfather Pokémon
  if (premium) return "pokemon";
  return null;
}

export function parseEntitlements(raw: string | null): EntitlementsState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EntitlementsState>;
    const premium = Boolean(parsed.premium);
    const allAccess = Boolean(parsed.allAccess);
    return {
      premium,
      allAccess,
      premiumCategory: normalizePremiumCategory(
        parsed.premiumCategory,
        premium || allAccess,
      ),
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
      // Persist migration if premiumCategory was filled in by parse
      const stored = window.localStorage.getItem(ENTITLEMENTS_STORAGE_KEY);
      if (stored && !stored.includes("premiumCategory")) {
        writeEntitlements(fromNew);
      }
      if (fromNew.premium || fromNew.allAccess) {
        window.localStorage.setItem(LEGACY_PREMIUM_STORAGE_KEY, "1");
      }
      return fromNew;
    }

    const legacy = window.localStorage.getItem(LEGACY_PREMIUM_STORAGE_KEY) === "1";
    if (legacy) {
      // Grandfather: legacy Premium = Pokémon full unlock
      const migrated: EntitlementsState = {
        premium: true,
        allAccess: false,
        premiumCategory: "pokemon",
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
      premiumCategory: null,
      categories: normalizeCategories(state.categories),
      sports: normalizeSports(state.sports),
    };
    if (normalized.allAccess) {
      normalized.premium = true;
      // All Access clears need for picker
      normalized.premiumCategory = null;
      for (const id of ADDON_CATEGORY_IDS) {
        if (!normalized.categories.includes(id)) {
          normalized.categories.push(id);
        }
      }
      // Ensure live categories are entitled via categories too (incl. pokemon)
      for (const id of LIVE_CATALOG_IDS) {
        if (!normalized.categories.includes(id)) {
          normalized.categories.push(id);
        }
      }
      for (const id of SPORT_ADDON_IDS) {
        if (!normalized.sports.includes(id)) {
          normalized.sports.push(id);
        }
      }
    } else {
      normalized.premiumCategory = normalizePremiumCategory(
        state.premiumCategory,
        normalized.premium,
      );
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
 * Whether the user may use Premium depth somewhere (has Premium or All Access).
 */
export function hasPremiumAccess(state: EntitlementsState): boolean {
  return state.premium || state.allAccess;
}

/**
 * Whether the user owns a category for full (paid) depth / selection badges.
 * - premiumCategory choice counts as owned for that live category
 * - add-ons in categories[] (incl. pokemon when Premium chose another live cat)
 * - Sports: category add-on OR any per-sport add-on
 * Free users may still browse live catalogs with FREE_CHASE_LIMIT (top 3).
 */
export function ownsCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (state.allAccess) return true;
  if (state.premiumCategory === categoryId) return true;
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
 * Full chase + entire set for a live category.
 * - allAccess → true
 * - else if premium && (premiumCategory === id || categories.includes(id)) → true
 * - else false (free top-3 only)
 */
export function hasFullAccessInCategory(
  state: EntitlementsState,
  categoryId: CategoryId,
): boolean {
  if (!isLiveCategory(categoryId)) return false;
  if (state.allAccess) return true;
  if (
    state.premium &&
    (state.premiumCategory === categoryId ||
      state.categories.includes(categoryId))
  ) {
    return true;
  }
  return false;
}

/**
 * Unlock Premium for one live category.
 * Keeps the first premiumCategory choice if already set (no overwrite).
 */
export function unlockPremiumState(
  prev: EntitlementsState,
  categoryId: CategoryId,
): EntitlementsState {
  if (!isLiveCategory(categoryId)) return prev;
  const premiumCategory =
    prev.premiumCategory && isLiveCategory(prev.premiumCategory)
      ? prev.premiumCategory
      : categoryId;
  return {
    ...prev,
    premium: true,
    premiumCategory,
  };
}

/**
 * Unlock a category add-on. Pokémon is allowed when Premium chose another
 * live category (and pokemon is not already covered by premiumCategory).
 */
export function unlockAddonState(
  prev: EntitlementsState,
  categoryId: CategoryId,
): EntitlementsState {
  if (categoryId === "pokemon") {
    if (prev.premiumCategory === "pokemon") return prev;
    if (prev.categories.includes("pokemon")) return prev;
    return {
      ...prev,
      categories: [...prev.categories, "pokemon"],
    };
  }
  if (prev.categories.includes(categoryId)) return prev;
  if (prev.premiumCategory === categoryId) return prev;
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
    premiumCategory: null,
    categories: [...ADDON_CATEGORY_IDS, ...LIVE_CATALOG_IDS].filter(
      (id, i, arr) => arr.indexOf(id) === i,
    ),
    sports: [...SPORT_ADDON_IDS],
  };
}

export type ApplyCheckoutOptions = {
  /** Live category chosen at Premium Checkout (session metadata.premium_category). */
  premiumCategory?: CategoryId | null;
};

/**
 * Apply one or more Stripe-confirmed entitlement keys onto local state.
 * When granting premium, uses options.premiumCategory (defaults to "pokemon"
 * for grandfathering sessions without metadata).
 */
export function applyCheckoutEntitlements(
  prev: EntitlementsState,
  keys: CheckoutEntitlementKey[],
  options?: ApplyCheckoutOptions,
): EntitlementsState {
  let next = {
    ...prev,
    categories: [...prev.categories],
    sports: [...prev.sports],
  };
  for (const key of keys) {
    if (key === "premium") {
      const chosen =
        options?.premiumCategory && isLiveCategory(options.premiumCategory)
          ? options.premiumCategory
          : "pokemon";
      next = unlockPremiumState(next, chosen);
      continue;
    }
    if (key === "all_access") {
      next = unlockAllAccessState();
      continue;
    }
    if (
      key === "pokemon" ||
      key === "one-piece" ||
      key === "mtg" ||
      key === "sports"
    ) {
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
  if (state.premium) {
    if (state.premiumCategory) {
      try {
        return `Premium · ${getCategory(state.premiumCategory).shortLabel}`;
      } catch {
        return "Premium";
      }
    }
    return "Premium";
  }
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

/** Live categories eligible for the Premium picker. */
export function premiumPickerCategories(): CategoryId[] {
  return [...LIVE_CATALOG_IDS];
}

export type { SportAddonId, CheckoutEntitlementKey };
