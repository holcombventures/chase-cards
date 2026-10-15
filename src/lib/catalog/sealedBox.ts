/**
 * Sealed booster box / display quote from a TCGCSV product feed.
 * Singles stay out (they have a collector Number). Cases, half boxes,
 * bundles, packs, and other sealed SKUs stay out too. When several
 * standard boxes are listed, the lower TCGplayer market is the accessible
 * one (Romance Dawn Wave 2, not the scarce Wave 1).
 */

export type SealedProduct = {
  productId: number;
  name?: string | null;
  extendedData?: { name?: string | null; value?: string | null }[] | null;
};

export type SealedPriceRow = {
  productId: number;
  marketPrice?: number | null;
  subTypeName?: string | null;
};

export type SealedGroup = {
  groupId: number;
  name: string;
  abbreviation: string;
};

export type SealedBoxQuote = {
  marketPrice: number;
  name: string;
  productId: number;
};

function finitePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function hasCollectorNumber(product: SealedProduct): boolean {
  for (const row of product.extendedData || []) {
    if ((row.name || "").trim().toLowerCase() !== "number") continue;
    if ((row.value || "").trim()) return true;
  }
  return false;
}

/** Standard booster box or booster display. Not a case, pack, or kit. */
export function isStandardBoosterBoxName(name: string): boolean {
  const text = name.toLowerCase().replace(/[’']/g, "'");
  if (
    /\b(japanese|japan|korean|chinese|thai|simplified|traditional)\b/.test(text) ||
    /\b(case|half|bundle|blister|trove|tin|deck|gift|kit|collection|prerelease|pre-release|starter|topper|empty|sleeved|code card)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return /\bbooster box(?:es)?\b/.test(text) || /\bbooster display\b/.test(text);
}

function marketForProduct(rows: readonly SealedPriceRow[]): number | null {
  let normal: number | null = null;
  let other: number | null = null;
  for (const row of rows) {
    const price = finitePrice(row.marketPrice);
    if (price === null) continue;
    if ((row.subTypeName || "").trim().toLowerCase() === "normal") {
      normal = normal === null ? price : Math.min(normal, price);
    } else if (other === null || price < other) {
      other = price;
    }
  }
  return normal ?? other;
}

/**
 * Lowest priced standard booster box or display in this group.
 * Normal subtype wins over a cheaper odd subtype of the same product.
 */
export function selectSealedBoosterBox(
  products: readonly SealedProduct[],
  prices: readonly SealedPriceRow[],
): SealedBoxQuote | null {
  const pricesByProduct = new Map<number, SealedPriceRow[]>();
  for (const row of prices) {
    if (!Number.isFinite(row.productId)) continue;
    const list = pricesByProduct.get(row.productId);
    if (list) list.push(row);
    else pricesByProduct.set(row.productId, [row]);
  }

  let best: SealedBoxQuote | null = null;
  for (const product of products) {
    if (!product || !Number.isFinite(product.productId)) continue;
    if (hasCollectorNumber(product)) continue;
    const name = (product.name || "").trim();
    if (!name || !isStandardBoosterBoxName(name)) continue;
    const marketPrice = marketForProduct(pricesByProduct.get(product.productId) || []);
    if (marketPrice === null) continue;
    if (!best || marketPrice < best.marketPrice) {
      best = { marketPrice, name, productId: product.productId };
    }
  }
  return best;
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function codePrefixes(setId: string): string[] {
  const raw = setId.trim();
  const prefixes = new Set<string>();
  if (raw) prefixes.add(raw.toUpperCase());
  const match = raw.match(/^([a-z]+)(\d+)(?:pt(\d+))?$/i);
  if (match) {
    const major = match[2].padStart(2, "0");
    const code = match[3] !== undefined ? `${match[1]}${major}.${match[3]}` : `${match[1]}${major}`;
    prefixes.add(code.toUpperCase());
  }
  return [...prefixes];
}

function nameMatches(groupName: string, setName: string): boolean {
  const full = groupName.trim().toLowerCase();
  const want = setName.trim().toLowerCase();
  if (!want) return false;
  if (full === want) return true;
  const colon = full.lastIndexOf(":");
  if (colon < 0) return false;
  return full.slice(colon + 1).trim() === want;
}

/**
 * Site set id → TCGCSV group.
 * Numeric ids are the group id (Lorcana, Riftbound, Gundam).
 * One Piece ids match the abbreviation (OP-01 → OP01, not OP01 PRE).
 * Pokémon matches the name after the colon ("Pitch Black") or a padded
 * code prefix (me5 → ME05:).
 */
export function matchTcgcsvGroup(
  groups: readonly SealedGroup[],
  set: { id: string; name?: string | null },
): SealedGroup | null {
  const id = set.id.trim();
  if (!id) return null;

  if (/^\d+$/.test(id)) {
    const numeric = groups.find((group) => String(group.groupId) === id);
    if (numeric) return numeric;
  }

  const token = compactId(id);
  if (token) {
    const byAbbreviation = groups.filter((group) => compactId(group.abbreviation) === token);
    if (byAbbreviation.length === 1) return byAbbreviation[0];
  }

  const setName = (set.name || "").trim();
  if (setName) {
    const byName = groups.filter((group) => nameMatches(group.name, setName));
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      return [...byName].sort((a, b) => a.name.length - b.name.length)[0];
    }
  }

  const prefixes = codePrefixes(id);
  const byCode = groups.filter((group) =>
    prefixes.some((code) => group.name.toUpperCase().startsWith(`${code}:`)),
  );
  if (byCode.length === 1) return byCode[0];
  if (byCode.length > 1) {
    const mains = byCode.filter((group) => !/promo/i.test(group.name));
    const pool = mains.length ? mains : byCode;
    return [...pool].sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}
