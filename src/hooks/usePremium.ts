"use client";

/**
 * Compatibility wrapper — Premium is now part of the entitlements model.
 * Prefer `useEntitlements` for new UI. Legacy `chase-cards-premium` still migrates.
 */

export {
  FREE_CHASE_LIMIT,
  PREMIUM_PRICE_LABEL,
  LEGACY_PREMIUM_STORAGE_KEY as PREMIUM_STORAGE_KEY,
} from "@/lib/entitlements";

import { useEntitlements } from "@/hooks/useEntitlements";

export function usePremium() {
  const { isPremium, ready, unlockPremium, restoreFree } = useEntitlements();
  return { isPremium, ready, unlockPremium, restoreFree };
}
