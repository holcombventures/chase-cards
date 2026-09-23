import { getStore } from "@netlify/blobs";
import {
  PRICE_SNAPSHOT_STORE,
  buildPriceSnapshot,
  parsePriceSnapshot,
  priceSnapshotKey,
  snapshotIsFresh,
  type PriceSnapshot,
} from "./priceSnapshot";
import type { CardsApiBody } from "./cardCacheModel";

/**
 * Site-wide Netlify Blobs store. Every serverless instance reads the same
 * price snapshots. Local `next dev` has no Blobs context, so that environment
 * falls back to process memory (same TTL) instead of failing the request.
 */
export type PriceSnapshotBackend = {
  get(key: string): Promise<unknown>;
  setJSON(key: string, data: unknown): Promise<void>;
};

let backendOverride: PriceSnapshotBackend | null = null;
let useMemory = false;
let warnedUnconfigured = false;
const memory = new Map<string, unknown>();

const memoryBackend: PriceSnapshotBackend = {
  async get(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  async setJSON(key, data) {
    memory.set(key, data);
  },
};

export function memoryPriceSnapshotBackend(): PriceSnapshotBackend {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, data) {
      map.set(key, data);
    },
  };
}

export function setPriceSnapshotBackendForTests(
  backend: PriceSnapshotBackend | null,
): void {
  backendOverride = backend;
}

export function priceSnapshotStoreKind(): "blobs" | "memory" {
  return useMemory || backendOverride ? "memory" : "blobs";
}

export function resetPriceSnapshotStoreForTests(): void {
  backendOverride = null;
  useMemory = false;
  warnedUnconfigured = false;
  memory.clear();
}

function isBlobsUnconfigured(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  const message = "message" in err ? String(err.message) : "";
  return (
    name === "MissingBlobsEnvironmentError" ||
    /has not been configured to use Netlify Blobs/.test(message)
  );
}

function isConsistencyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  return name === "BlobsConsistencyError";
}

function blobsBackend(consistency: "strong" | "eventual"): PriceSnapshotBackend {
  const store = getStore({
    name: PRICE_SNAPSHOT_STORE,
    consistency: consistency === "strong" ? "strong" : undefined,
  });
  return {
    async get(key) {
      return store.get(key, { type: "json" });
    },
    async setJSON(key, data) {
      await store.setJSON(key, data);
    },
  };
}

function resolveBackend(): PriceSnapshotBackend {
  if (backendOverride) return backendOverride;
  if (useMemory) return memoryBackend;
  try {
    return blobsBackend("strong");
  } catch (err) {
    if (!isBlobsUnconfigured(err)) throw err;
    useMemory = true;
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "Netlify Blobs is not configured; price snapshots stay on this instance only.",
      );
    }
    return memoryBackend;
  }
}

async function backendGet(key: string): Promise<unknown> {
  const backend = resolveBackend();
  if (backend === memoryBackend || backendOverride) return backend.get(key);
  try {
    return await backend.get(key);
  } catch (err) {
    if (!isConsistencyError(err)) throw err;
    return blobsBackend("eventual").get(key);
  }
}

async function backendSet(key: string, snapshot: PriceSnapshot): Promise<void> {
  const backend = resolveBackend();
  if (backend === memoryBackend || backendOverride) {
    await backend.setJSON(key, snapshot);
    return;
  }
  try {
    await backend.setJSON(key, snapshot);
  } catch (err) {
    if (!isConsistencyError(err)) throw err;
    await blobsBackend("eventual").setJSON(key, snapshot);
  }
}

export async function readFreshPriceSnapshot(
  category: string,
  setId: string,
  now = Date.now(),
): Promise<PriceSnapshot | null> {
  const key = priceSnapshotKey(category, setId);
  let raw: unknown;
  try {
    raw = await backendGet(key);
  } catch (err) {
    console.error("price snapshot read failed:", err);
    return null;
  }
  const snap = parsePriceSnapshot(raw);
  if (!snap || !snapshotIsFresh(snap.storedAt, now)) return null;
  return snap;
}

export async function savePriceSnapshot(
  category: string,
  setId: string,
  body: CardsApiBody,
  now = Date.now(),
): Promise<PriceSnapshot> {
  const snapshot = buildPriceSnapshot(category, setId, body, now);
  await backendSet(priceSnapshotKey(category, setId), snapshot);
  return snapshot;
}
