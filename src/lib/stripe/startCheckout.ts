import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";

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
): Promise<StartCheckoutResult> {
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitlement }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      sessionId?: string;
      error?: string;
      demoFallback?: boolean;
    };

    if (res.ok && body.url) {
      return {
        ok: true,
        url: body.url,
        sessionId: body.sessionId ?? "",
      };
    }

    return {
      ok: false,
      demoFallback: Boolean(body.demoFallback) || res.status === 503,
      error: body.error || `Checkout failed (${res.status})`,
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
      error?: string;
    };
    if (!res.ok) {
      return {
        paid: false,
        entitlements: [],
        error: body.error || `Confirm failed (${res.status})`,
      };
    }
    const keys = Array.isArray(body.entitlements)
      ? (body.entitlements.filter(
          (k): k is CheckoutEntitlementKey => typeof k === "string",
        ) as CheckoutEntitlementKey[])
      : [];
    return {
      paid: Boolean(body.paid),
      entitlements: keys,
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
