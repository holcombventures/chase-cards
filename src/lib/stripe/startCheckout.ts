import type { CategoryId } from "@/lib/catalog/types";
import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";

export type StartCheckoutOptions = {
  /** Required for Premium: which live category to unlock fully. */
  premiumCategory?: CategoryId;
};

export type StartCheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | {
      ok: false;
      demoFallback: boolean;
      error: string;
      status: number;
    };

/**
 * Client helper: POST /api/stripe/checkout and return the Stripe session URL.
 * When Stripe/env is missing, returns demoFallback so UI can unlock locally.
 */
export async function startCheckout(
  entitlement: CheckoutEntitlementKey,
  options?: StartCheckoutOptions,
): Promise<StartCheckoutResult> {
  try {
    const body: Record<string, unknown> = { entitlement };
    if (entitlement === "premium" && options?.premiumCategory) {
      body.premiumCategory = options.premiumCategory;
    }
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as {
      url?: string;
      sessionId?: string;
      error?: string;
      demoFallback?: boolean;
    };

    if (res.ok && parsed.url) {
      return {
        ok: true,
        url: parsed.url,
        sessionId: parsed.sessionId ?? "",
      };
    }

    return {
      ok: false,
      demoFallback: Boolean(parsed.demoFallback) || res.status === 503,
      error: parsed.error || `Checkout failed (${res.status})`,
      status: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      demoFallback: true,
      error: err instanceof Error ? err.message : "Network error starting checkout",
      status: 0,
    };
  }
}

export type ConfirmCheckoutResult = {
  paid: boolean;
  entitlements: CheckoutEntitlementKey[];
  premiumCategory?: CategoryId | null;
  error?: string;
};

export async function confirmCheckoutSession(
  sessionId: string,
): Promise<ConfirmCheckoutResult> {
  try {
    const res = await fetch(
      `/api/stripe/confirm?session_id=${encodeURIComponent(sessionId)}`,
    );
    const body = (await res.json().catch(() => ({}))) as {
      paid?: boolean;
      entitlements?: string[];
      premiumCategory?: string | null;
      metadata?: Record<string, string>;
      error?: string;
    };
    if (!res.ok) {
      return {
        paid: Boolean(body.paid),
        entitlements: [],
        error: body.error || `Confirm failed (${res.status})`,
      };
    }
    const keys = Array.isArray(body.entitlements)
      ? (body.entitlements.filter(
          (k): k is CheckoutEntitlementKey => typeof k === "string",
        ) as CheckoutEntitlementKey[])
      : [];
    const fromBody = body.premiumCategory;
    const fromMeta = body.metadata?.premium_category;
    const rawCat =
      typeof fromBody === "string"
        ? fromBody
        : typeof fromMeta === "string"
          ? fromMeta
          : null;
    return {
      paid: Boolean(body.paid),
      entitlements: keys,
      premiumCategory: rawCat as CategoryId | null,
      error: body.error,
    };
  } catch (err) {
    return {
      paid: false,
      entitlements: [],
      error: err instanceof Error ? err.message : "Network error confirming checkout",
    };
  }
}
