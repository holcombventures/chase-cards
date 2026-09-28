import { NextResponse } from "next/server";
import {
  isCategoryId,
  isPaidLiveCategory,
  type CategoryId,
} from "@/lib/catalog/types";
import { getStripe, resolveSiteOrigin } from "@/lib/stripe/client";
import {
  ENTITLEMENT_LABELS,
  getPriceIdForEntitlement,
  isCheckoutEntitlementKey,
  isStripeConfigured,
  missingStripeConfigMessage,
  type CheckoutEntitlementKey,
} from "@/lib/stripe/catalog";

export const runtime = "nodejs";

type CheckoutBody = {
  entitlement?: unknown;
  premiumCategory?: unknown;
};

export async function POST(req: Request) {
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON body. Expected { entitlement: string, premiumCategory?: string }.",
      },
      { status: 400 },
    );
  }

  const entitlementRaw = body.entitlement;
  if (!isCheckoutEntitlementKey(entitlementRaw)) {
    return NextResponse.json(
      {
        error:
          "Invalid entitlement. Use premium | all_access | pokemon | one-piece | mtg | sports | sports-baseball | sports-basketball | sports-football | sports-hockey | sports-soccer.",
        demoFallback: true,
      },
      { status: 400 },
    );
  }

  const entitlement: CheckoutEntitlementKey = entitlementRaw;

  let premiumCategory: CategoryId | null = null;
  if (entitlement === "premium") {
    const raw = body.premiumCategory;
    if (
      typeof raw !== "string" ||
      !isCategoryId(raw) ||
      !isPaidLiveCategory(raw)
    ) {
      return NextResponse.json(
        {
          error:
            'Premium checkout requires premiumCategory: a live category id ("pokemon" | "one-piece" | "mtg").',
          demoFallback: true,
        },
        { status: 400 },
      );
    }
    premiumCategory = raw;
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error: missingStripeConfigMessage(entitlement),
        demoFallback: true,
        configured: false,
      },
      { status: 503 },
    );
  }

  const priceId = getPriceIdForEntitlement(entitlement);
  if (!priceId) {
    return NextResponse.json(
      {
        error: missingStripeConfigMessage(entitlement),
        demoFallback: true,
        configured: false,
        missingPriceEnv: true,
      },
      { status: 503 },
    );
  }

  try {
    const stripe = getStripe();
    const origin = resolveSiteOrigin(req);
    const successUrl = `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?checkout=cancel`;

    const metadata: Record<string, string> = {
      entitlement,
      product_label: ENTITLEMENT_LABELS[entitlement],
    };
    if (premiumCategory) {
      metadata.premium_category = premiumCategory;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      payment_intent_data: {
        metadata: {
          entitlement,
          ...(premiumCategory
            ? { premium_category: premiumCategory }
            : {}),
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      entitlement,
      premiumCategory,
    });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    const message =
      err instanceof Error ? err.message : "Failed to create Checkout Session.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
