import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type Stripe from "stripe";
import {
  CHECKOUT_ENTITLEMENT_KEYS,
  PRICE_ENV_BY_ENTITLEMENT,
  type CheckoutEntitlementKey,
} from "./catalog";
import {
  MISSING_ENTITLEMENT_METADATA_ERROR,
  PAID_PRICE_MISMATCH_ERROR,
  grantFromCheckoutSession,
} from "./entitlements-from-session";

const ADDON = "price_addon";
const PREMIUM = "price_premium";
const ALL_ACCESS = "price_all_access";

const ADDON_KEYS = CHECKOUT_ENTITLEMENT_KEYS.filter(
  (key) => key !== "premium" && key !== "all_access",
);

const savedEnv = new Map<string, string | undefined>();

function setPrices(prices: Partial<Record<CheckoutEntitlementKey, string>>) {
  for (const key of CHECKOUT_ENTITLEMENT_KEYS) {
    const name = PRICE_ENV_BY_ENTITLEMENT[key];
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    const value = prices[key];
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
}

function sharedAddonPrices(
  overrides: Partial<Record<CheckoutEntitlementKey, string>> = {},
) {
  const prices: Partial<Record<CheckoutEntitlementKey, string>> = {
    premium: PREMIUM,
    all_access: ALL_ACCESS,
  };
  for (const key of ADDON_KEYS) prices[key] = ADDON;
  Object.assign(prices, overrides);
  setPrices(prices);
}

function session(options: {
  entitlement?: string | null;
  priceId?: string | null;
}): Stripe.Checkout.Session {
  const metadata =
    options.entitlement == null ? {} : { entitlement: options.entitlement };
  const data =
    options.priceId == null
      ? []
      : [{ price: { id: options.priceId } } as Stripe.LineItem];
  return {
    metadata,
    line_items: { data },
  } as Stripe.Checkout.Session;
}

afterEach(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

test("shared add-on Price grants only the purchased key", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: "pokemon", priceId: ADDON }),
  );
  assert.equal(grant.ok, true);
  assert.deepEqual(grant.entitlements, ["pokemon"]);
  assert.equal(grant.entitlements.includes("sports-soccer"), false);
});

test("shared add-on Price grants a per-sport key without granting other sports", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: "sports-baseball", priceId: ADDON }),
  );
  assert.deepEqual(grant.entitlements, ["sports-baseball"]);
});

test("Premium paid with an add-on Price is rejected", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: "premium", priceId: ADDON }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.equal(grant.error, PAID_PRICE_MISMATCH_ERROR);
  assert.deepEqual(grant.entitlements, []);
});

test("Premium whose own Price ID is the shared add-on Price is rejected", () => {
  sharedAddonPrices({ premium: ADDON });
  const grant = grantFromCheckoutSession(
    session({ entitlement: "premium", priceId: ADDON }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.equal(grant.error, PAID_PRICE_MISMATCH_ERROR);
  assert.deepEqual(grant.entitlements, []);
});

test("All Access paid with an add-on Price is rejected", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: "all_access", priceId: ADDON }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.deepEqual(grant.entitlements, []);
});

test("Premium and All Access still grant when their own Price IDs match", () => {
  sharedAddonPrices();
  assert.deepEqual(
    grantFromCheckoutSession(
      session({ entitlement: "premium", priceId: PREMIUM }),
    ).entitlements,
    ["premium"],
  );
  assert.deepEqual(
    grantFromCheckoutSession(
      session({ entitlement: "all_access", priceId: ALL_ACCESS }),
    ).entitlements,
    ["all_access"],
  );
});

test("a Price ID that is not configured is rejected", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: "pokemon", priceId: "price_unknown" }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.equal(grant.error, PAID_PRICE_MISMATCH_ERROR);
  assert.deepEqual(grant.entitlements, []);
});

test("missing metadata grants nothing even when the Price ID is ambiguous", () => {
  sharedAddonPrices();
  const grant = grantFromCheckoutSession(
    session({ entitlement: null, priceId: ADDON }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.equal(grant.error, MISSING_ENTITLEMENT_METADATA_ERROR);
  assert.deepEqual(grant.entitlements, []);
});

test("invalid metadata grants nothing and does not reverse-lookup a unique Price", () => {
  setPrices({
    premium: PREMIUM,
    all_access: ALL_ACCESS,
    pokemon: "price_pokemon_only",
  });
  const grant = grantFromCheckoutSession(
    session({ entitlement: "not-a-plan", priceId: "price_pokemon_only" }),
  );
  assert.equal(grant.ok, false);
  if (grant.ok) return;
  assert.equal(grant.error, MISSING_ENTITLEMENT_METADATA_ERROR);
  assert.deepEqual(grant.entitlements, []);
});
