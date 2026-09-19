/**
 * Stripe Checkout catalog — entitlement keys ↔ env Price IDs.
 * Price IDs live in Netlify/env; missing IDs keep demo unlock working.
 */

export type CheckoutEntitlementKey =
  | "premium"
  | "all_access"
  | "pokemon"
  | "one-piece"
  | "mtg"
  | "sports"
  | "sports-baseball"
  | "sports-basketball"
  | "sports-football"
  | "sports-hockey"
  | "sports-soccer";

export type SportAddonId =
  | "baseball"
  | "basketball"
  | "football"
  | "hockey"
  | "soccer";

export const SPORT_ADDON_IDS: readonly SportAddonId[] = [
  "baseball",
  "basketball",
  "football",
  "hockey",
  "soccer",
] as const;

export const CHECKOUT_ENTITLEMENT_KEYS: readonly CheckoutEntitlementKey[] = [
  "premium",
  "all_access",
  "pokemon",
  "one-piece",
  "mtg",
  "sports",
  "sports-baseball",
  "sports-basketball",
  "sports-football",
  "sports-hockey",
  "sports-soccer",
] as const;

/** Env var name holding the Stripe Price ID for each product. */
export const PRICE_ENV_BY_ENTITLEMENT: Record<CheckoutEntitlementKey, string> = {
  premium: "STRIPE_PRICE_PREMIUM",
  all_access: "STRIPE_PRICE_ALL_ACCESS",
  pokemon: "STRIPE_PRICE_POKEMON",
  "one-piece": "STRIPE_PRICE_ONE_PIECE",
  mtg: "STRIPE_PRICE_MTG",
  sports: "STRIPE_PRICE_SPORTS",
  "sports-baseball": "STRIPE_PRICE_SPORTS_BASEBALL",
  "sports-basketball": "STRIPE_PRICE_SPORTS_BASKETBALL",
  "sports-football": "STRIPE_PRICE_SPORTS_FOOTBALL",
  "sports-hockey": "STRIPE_PRICE_SPORTS_HOCKEY",
  "sports-soccer": "STRIPE_PRICE_SPORTS_SOCCER",
};

export const ENTITLEMENT_LABELS: Record<CheckoutEntitlementKey, string> = {
  premium: "Premium",
  all_access: "All Access",
  pokemon: "Pokémon add-on",
  "one-piece": "One Piece add-on",
  mtg: "MTG add-on",
  sports: "Sports add-on",
  "sports-baseball": "Baseball add-on",
  "sports-basketball": "Basketball add-on",
  "sports-football": "Football add-on",
  "sports-hockey": "Hockey add-on",
  "sports-soccer": "Soccer add-on",
};

export function isCheckoutEntitlementKey(
  value: unknown,
): value is CheckoutEntitlementKey {
  return (
    typeof value === "string" &&
    (CHECKOUT_ENTITLEMENT_KEYS as readonly string[]).includes(value)
  );
}

export function sportIdFromEntitlement(
  key: CheckoutEntitlementKey,
): SportAddonId | null {
  if (!key.startsWith("sports-")) return null;
  const id = key.slice("sports-".length);
  return (SPORT_ADDON_IDS as readonly string[]).includes(id)
    ? (id as SportAddonId)
    : null;
}

export function getPriceIdForEntitlement(
  key: CheckoutEntitlementKey,
): string | null {
  const envName = PRICE_ENV_BY_ENTITLEMENT[key];
  const raw = process.env[envName]?.trim();
  return raw || null;
}

/** Build reverse map priceId → entitlement key(s) from current env. */
export function buildPriceIdToEntitlementMap(): Map<
  string,
  CheckoutEntitlementKey
> {
  const map = new Map<string, CheckoutEntitlementKey>();
  for (const key of CHECKOUT_ENTITLEMENT_KEYS) {
    const priceId = getPriceIdForEntitlement(key);
    if (priceId) map.set(priceId, key);
  }
  return map;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function missingStripeConfigMessage(
  key: CheckoutEntitlementKey,
): string {
  const envName = PRICE_ENV_BY_ENTITLEMENT[key];
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return "Stripe is not configured (STRIPE_SECRET_KEY missing). Use demo unlock locally.";
  }
  return `Stripe Price ID missing for ${key} (set ${envName}). Use demo unlock until prices are configured.`;
}
