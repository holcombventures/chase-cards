"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryId } from "@/lib/catalog/types";
import {
  ENTITLEMENTS_STORAGE_KEY,
  EMPTY_ENTITLEMENTS,
  LEGACY_PREMIUM_STORAGE_KEY,
  applyCheckoutEntitlements,
  clearEntitlements,
  hasFullAccessInCategory,
  hasPremiumAccess,
  ownsCategory,
  ownsSport,
  readEntitlements,
  unlockAddonState,
  unlockAllAccessState,
  unlockPremiumState,
  unlockSportState,
  writeEntitlements,
  type ApplyCheckoutOptions,
  type CheckoutEntitlementKey,
  type EntitlementsState,
  type SportAddonId,
} from "@/lib/entitlements";

/**
 * Entitlements hook — localStorage + optional Stripe confirm grants.
 * Migrates legacy `chase-cards-premium` on first read (→ premium + pokemon).
 */
export function useEntitlements() {
  const [entitlements, setEntitlements] =
    useState<EntitlementsState>(EMPTY_ENTITLEMENTS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setEntitlements(readEntitlements());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (
        e.key === ENTITLEMENTS_STORAGE_KEY ||
        e.key === LEGACY_PREMIUM_STORAGE_KEY ||
        e.key === null
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const persist = useCallback((next: EntitlementsState) => {
    writeEntitlements(next);
    setEntitlements(readEntitlements());
  }, []);

  const unlockPremium = useCallback(
    (categoryId: CategoryId) => {
      persist(unlockPremiumState(readEntitlements(), categoryId));
    },
    [persist],
  );

  const unlockAddon = useCallback(
    (categoryId: CategoryId) => {
      persist(unlockAddonState(readEntitlements(), categoryId));
    },
    [persist],
  );

  const unlockSport = useCallback(
    (sportId: SportAddonId) => {
      persist(unlockSportState(readEntitlements(), sportId));
    },
    [persist],
  );

  const unlockAllAccess = useCallback(() => {
    persist(unlockAllAccessState());
  }, [persist]);

  const applyPaidEntitlements = useCallback(
    (keys: CheckoutEntitlementKey[], options?: ApplyCheckoutOptions) => {
      if (!keys.length) return readEntitlements();
      const next = applyCheckoutEntitlements(
        readEntitlements(),
        keys,
        options,
      );
      persist(next);
      return readEntitlements();
    },
    [persist],
  );

  const restoreFree = useCallback(() => {
    clearEntitlements();
    setEntitlements({ ...EMPTY_ENTITLEMENTS });
  }, []);

  const isPremium = hasPremiumAccess(entitlements);

  return {
    entitlements,
    ready,
    isPremium,
    ownsCategory: (id: CategoryId) => ownsCategory(entitlements, id),
    ownsSport: (id: SportAddonId) => ownsSport(entitlements, id),
    hasFullAccessInCategory: (id: CategoryId) =>
      hasFullAccessInCategory(entitlements, id),
    unlockPremium,
    unlockAddon,
    unlockSport,
    unlockAllAccess,
    applyPaidEntitlements,
    restoreFree,
  };
}
