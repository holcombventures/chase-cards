/**
 * Display prices for shop, paywall, and footer copy.
 *
 * Checkout does not read these. `POST /api/stripe/checkout` charges the
 * one-time Stripe Price (`mode: "payment"`) whose ID is in the matching
 * `STRIPE_PRICE_*` env var. Keep those Price amounts equal to these labels.
 */
export const PREMIUM_PRICE_LABEL = "$2.99";
export const ADDON_PRICE_LABEL = "$1.99";
export const ALL_ACCESS_PRICE_LABEL = "$9.99";
