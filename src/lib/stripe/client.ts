import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!stripeSingleton) {
    // Use SDK default API version (pinned in the installed stripe package).
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

/** Resolve public site origin for Checkout success/cancel URLs. */
export function resolveSiteOrigin(req: Request): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through */
    }
  }

  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (host) {
    return `${proto}://${host}`;
  }

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      /* fall through */
    }
  }

  return "http://localhost:3000";
}
