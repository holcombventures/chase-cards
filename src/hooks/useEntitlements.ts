"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryId } from "@/lib/catalog/types";
import {
  ENTITLEMENTS_STORAGE_KEY,
  EMPTY_ENTITLEMENTS,
  LEGACY_PREMIUM_STORAGE_KEY,
  clearEntitlements,
  hasFullAccessInCategory,
  hasPremiumAccess,
  ownsCategory,
  readEntitlements,
  unlockAddonState,
  unlockAllAccessState,
  unlockPremiumState,
  writeEntitlements,
  type EntitlementsState,
} from "@/lib/entitlements";

/**
 * Demo entitlements hook — localStorage only.
 * Migrates legacy `chase-cards-premium` on first read.
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

  const unlockPremium = useCallback(() => {
    persist(unlockPremiumState(readEntitlements()));
  }, [persist]);

  const unlockAddon = useCallback(
    (categoryId: CategoryId) => {
      persist(unlockAddonState(readEntitlements(), categoryId));
    },
    [persist],
  );

  const unlockAllAccess = useCallback(() => {
    persist(unlockAllAccessState());
  }, [persist]);

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
    hasFullAccessInCategory: (id: CategoryId) =>
      hasFullAccessInCategory(entitlements, id),
    unlockPremium,
    unlockAddon,
    unlockAllAccess,
    restoreFree,
  };
}
