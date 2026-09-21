import {
  catalogIsFresh,
  pricesAreFresh,
  type CardsApiBody,
} from "./cardCacheModel";

export const MAX_PAYLOAD_ENTRIES = 16;

type Entry = {
  body: CardsApiBody;
  storedAt: number;
};

export type PayloadLoadResult =
  | { ok: true; body: CardsApiBody }
  | { ok: false; status: number; body: unknown };

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<PayloadLoadResult>>();

export function readCachedPayload(
  key: string,
  now = Date.now(),
): { body: CardsApiBody; storedAt: number } | null {
  const hit = entries.get(key);
  if (!hit) return null;
  if (!catalogIsFresh(hit.storedAt, now)) {
    entries.delete(key);
    return null;
  }
  entries.delete(key);
  entries.set(key, hit);
  return hit;
}

export function writePayload(
  key: string,
  body: CardsApiBody,
  now = Date.now(),
): void {
  entries.delete(key);
  entries.set(key, { body, storedAt: now });
  while (entries.size > MAX_PAYLOAD_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * One upstream card load per set key, shared by parallel catalog + price requests.
 * A fresh price snapshot is reused; errors are not stored.
 */
export function loadSharedPayload(
  key: string,
  loader: () => Promise<PayloadLoadResult>,
  now = Date.now(),
): Promise<PayloadLoadResult> {
  const hit = readCachedPayload(key, now);
  if (hit && pricesAreFresh(hit.storedAt, now)) {
    return Promise.resolve({ ok: true, body: hit.body });
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = loader()
    .then((result) => {
      if (result.ok) writePayload(key, result.body, now);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Test helper — process-local cache only. */
export function resetPayloadCacheForTests(): void {
  entries.clear();
  inflight.clear();
}
