import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/stripe/catalog";
import { entitlementsFromCheckoutSession } from "@/lib/stripe/entitlements-from-session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id query parameter." },
      { status: 400 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error: "Stripe is not configured (STRIPE_SECRET_KEY missing).",
        paid: false,
        entitlements: [],
      },
      { status: 503 },
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price"],
    });

    const paid = session.payment_status === "paid";
    if (!paid) {
      return NextResponse.json({
        paid: false,
        payment_status: session.payment_status,
        entitlements: [] as string[],
        sessionId: session.id,
      });
    }

    let lineItems = session.line_items?.data ?? null;
    if (!lineItems || lineItems.length === 0) {
      const listed = await stripe.checkout.sessions.listLineItems(sessionId, {
        limit: 20,
        expand: ["data.price"],
      });
      lineItems = listed.data;
    }

    const entitlements = entitlementsFromCheckoutSession(session, lineItems);

    return NextResponse.json({
      paid: true,
      payment_status: session.payment_status,
      entitlements,
      sessionId: session.id,
      metadata: session.metadata ?? {},
    });
  } catch (err) {
    console.error("[stripe/confirm]", err);
    const message =
      err instanceof Error ? err.message : "Failed to retrieve Checkout Session.";
    return NextResponse.json({ error: message, paid: false }, { status: 502 });
  }
}
