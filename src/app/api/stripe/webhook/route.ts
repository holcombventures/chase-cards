import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { grantFromCheckoutSession } from "@/lib/stripe/entitlements-from-session";

export const runtime = "nodejs";

/**
 * Optional webhook for checkout.session.completed.
 * Client-side GET /api/stripe/confirm remains primary until user accounts exist.
 * Verifies signature with STRIPE_WEBHOOK_SECRET when set.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      {
        error:
          "STRIPE_WEBHOOK_SECRET is not set. Configure the webhook endpoint in Stripe Dashboard when ready.",
        received: false,
      },
      { status: 503 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not set.", received: false },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const eventSession = event.data.object;
      let session = eventSession;
      if (eventSession.id) {
        try {
          session = await stripe.checkout.sessions.retrieve(eventSession.id, {
            expand: ["line_items.data.price"],
          });
        } catch (loadErr) {
          console.error("[stripe/webhook] line item load failed", loadErr);
        }
      }
      const grant = grantFromCheckoutSession(session);
      console.info("[stripe/webhook] checkout.session.completed", {
        sessionId: session.id,
        payment_status: session.payment_status,
        entitlementMeta: session.metadata?.entitlement ?? null,
        entitlements: grant.entitlements,
        grantError: grant.ok ? null : grant.error,
      });
    } else {
      console.info("[stripe/webhook] ack", { type: event.type, id: event.id });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook]", err);
    const message =
      err instanceof Error ? err.message : "Webhook signature verification failed.";
    return NextResponse.json({ error: message, received: false }, { status: 400 });
  }
}
