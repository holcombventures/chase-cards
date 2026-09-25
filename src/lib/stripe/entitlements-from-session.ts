import type Stripe from "stripe";
import {
  CHECKOUT_ENTITLEMENT_KEYS,
  getPriceIdForEntitlement,
  isCheckoutEntitlementKey,
  type CheckoutEntitlementKey,
} from "./catalog";

/**
 * Grant decision for a paid Checkout Session.
 * Identity is session.metadata.entitlement (set by POST /api/stripe/checkout).
 * Line-item Price IDs only validate the charge. They never choose the key.
 */
export type CheckoutGrant =
  | { ok: true; entitlements: CheckoutEntitlementKey[] }
  | { ok: false; error: string; entitlements: [] };

export const PAID_PRICE_MISMATCH_ERROR =
  "Paid price does not match the purchased plan.";

export const MISSING_ENTITLEMENT_METADATA_ERROR =
  "Checkout session is missing a valid entitlement.";

const STRICT_PRICE_KEYS = new Set<CheckoutEntitlementKey>([
  "premium",
  "all_access",
]);

function isAddonKey(key: CheckoutEntitlementKey): boolean {
  return !STRICT_PRICE_KEYS.has(key);
}

/** Every Price ID configured on an add-on env var, including duplicates. */
export function configuredAddonPriceIds(): Set<string> {
  const ids = new Set<string>();
  for (const key of CHECKOUT_ENTITLEMENT_KEYS) {
    if (!isAddonKey(key)) continue;
    const id = getPriceIdForEntitlement(key);
    if (id) ids.add(id);
  }
  return ids;
}

function priceIdOf(
  price: Stripe.LineItem["price"] | string | null | undefined,
): string | null {
  if (!price) return null;
  if (typeof price === "string") {
    const id = price.trim();
    return id || null;
  }
  const id = price.id?.trim();
  return id || null;
}

function paidPriceIds(
  session: Stripe.Checkout.Session,
  lineItems?: Stripe.LineItem[] | null,
): string[] {
  const ids = new Set<string>();
  const take = (items: Stripe.LineItem[] | undefined | null) => {
    if (!items) return;
    for (const item of items) {
      const id = priceIdOf(item.price);
      if (id) ids.add(id);
    }
  };
  take(session.line_items?.data);
  take(lineItems);
  return [...ids];
}

/**
 * Premium and All Access must match their own Price ID, and that ID must
 * not also be configured as an add-on. Add-ons accept any configured add-on
 * Price ID, so one shared $1.99 Price can be pasted into every add-on var.
 */
export function paidPriceMatchesEntitlement(
  key: CheckoutEntitlementKey,
  paidIds: readonly string[],
): boolean {
  if (paidIds.length === 0) return false;
  const addonIds = configuredAddonPriceIds();
  if (key === "premium" || key === "all_access") {
    const own = getPriceIdForEntitlement(key);
    if (!own || addonIds.has(own)) return false;
    return paidIds.every((id) => id === own);
  }
  if (addonIds.size === 0) return false;
  return paidIds.every((id) => addonIds.has(id));
}

export function grantFromCheckoutSession(
  session: Stripe.Checkout.Session,
  lineItems?: Stripe.LineItem[] | null,
): CheckoutGrant {
  const meta = session.metadata?.entitlement?.trim();
  if (!meta || !isCheckoutEntitlementKey(meta)) {
    return {
      ok: false,
      error: MISSING_ENTITLEMENT_METADATA_ERROR,
      entitlements: [],
    };
  }

  const paidIds = paidPriceIds(session, lineItems);
  if (!paidPriceMatchesEntitlement(meta, paidIds)) {
    return {
      ok: false,
      error: PAID_PRICE_MISMATCH_ERROR,
      entitlements: [],
    };
  }

  return { ok: true, entitlements: [meta] };
}
