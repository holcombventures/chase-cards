"use client";

import { useCallback, useEffect, useState } from "react";

export const PREMIUM_STORAGE_KEY = "chase-cards-premium";
export const PREMIUM_PRICE_LABEL = "$4.99";
export const FREE_CHASE_LIMIT = 3;

function readPremiumFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PREMIUM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Demo Premium gate — localStorage only, no Stripe / payments.
 */
export function usePremium() {
  const [isPremium, setIsPremium] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsPremium(readPremiumFlag());
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === PREMIUM_STORAGE_KEY || e.key === null) {
        setIsPremium(readPremiumFlag());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const unlockPremium = useCallback(() => {
    try {
      window.localStorage.setItem(PREMIUM_STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setIsPremium(true);
  }, []);

  const restoreFree = useCallback(() => {
    try {
      window.localStorage.removeItem(PREMIUM_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setIsPremium(false);
  }, []);

  return { isPremium, ready, unlockPremium, restoreFree };
}
