"use client";

import type { CategoryId } from "@/lib/catalog/types";
import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";
import { startCheckout } from "@/lib/stripe/startCheckout";

export type PurchaseHandler = {
  /** Called when Stripe is unavailable — run local demo unlock */
  onDemoFallback: () => void;
  /** Optional status for UI (loading / error toast) */
  onStatus?: (message: string | null) => void;
  /** Live category for Premium Checkout metadata */
  premiumCategory?: CategoryId;
};

/**
 * Try Stripe Checkout; fall back to demo unlock when not configured.
 * Redirects the browser to session.url on success.
 */
export async function purchaseEntitlement(
  entitlement: CheckoutEntitlementKey,
  { onDemoFallback, onStatus, premiumCategory }: PurchaseHandler,
): Promise<void> {
  onStatus?.("Starting checkout…");
  const result = await startCheckout(entitlement, {
    premiumCategory:
      entitlement === "premium" ? premiumCategory : undefined,
  });
  if (result.ok) {
    onStatus?.(null);
    window.location.assign(result.url);
    return;
  }
  if (result.demoFallback) {
    onStatus?.(null);
    onDemoFallback();
    return;
  }
  onStatus?.(result.error);
}
