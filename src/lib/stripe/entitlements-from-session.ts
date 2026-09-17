import type Stripe from "stripe";
import {
  buildPriceIdToEntitlementMap,
  isCheckoutEntitlementKey,
  type CheckoutEntitlementKey,
} from "@/lib/stripe/catalog";

/**
 * Map a paid Checkout Session → entitlement keys to grant client-side.
 * Prefers session.metadata.entitlement; also maps line-item price IDs.
 */
export function entitlementsFromCheckoutSession(
  session: Stripe.Checkout.Session,
  lineItems?: Stripe.LineItem[] | null,
): CheckoutEntitlementKey[] {
  const keys = new Set<CheckoutEntitlementKey>();

  const meta = session.metadata?.entitlement?.trim();
  if (meta && isCheckoutEntitlementKey(meta)) {
    keys.add(meta);
  }

  const priceMap = buildPriceIdToEntitlementMap();
  const collectPrice = (priceId: string | null | undefined) => {
    if (!priceId) return;
    const key = priceMap.get(priceId);
    if (key) keys.add(key);
  };

  if (session.line_items?.data) {
    for (const item of session.line_items.data) {
      const price = item.price;
      collectPrice(typeof price === "string" ? price : price?.id);
    }
  }

  if (lineItems) {
    for (const item of lineItems) {
      const price = item.price;
      collectPrice(typeof price === "string" ? price : price?.id);
    }
  }

  return Array.from(keys);
}
