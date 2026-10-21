import { getStore } from "@netlify/blobs";

/**
 * Blobs store for hype price history and cached public signals.
 * Separate from `price-snapshots` so a history write cannot replace a
 * catalog price snapshot. Local dev falls back to process memory.
 */
const STORE_NAME = "hype-price-history";

type BlobBackend = {
  get(key: string): Promise<unknown>;
  setJSON(key: string, data: unknown): Promise<void>;
};

let useMemory = false;
let warned = false;
const memory = new Map<string, unknown>();

const memoryBackend: BlobBackend = {
  async get(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  async setJSON(key, data) {
    memory.set(key, data);
  },
};

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

function blobsBackend(consistency: "strong" | "eventual"): BlobBackend {
  const store = getStore({
    name: STORE_NAME,
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

function resolveBackend(): BlobBackend {
  if (useMemory) return memoryBackend;
  try {
    return blobsBackend("strong");
  } catch (err) {
    if (!isBlobsUnconfigured(err)) throw err;
    useMemory = true;
    if (!warned) {
      warned = true;
      console.warn("Netlify Blobs is not configured; hype history stays on this instance only.");
    }
    return memoryBackend;
  }
}

export async function readToolJson(key: string): Promise<unknown> {
  const backend = resolveBackend();
  if (backend === memoryBackend) return backend.get(key);
  try {
    return await backend.get(key);
  } catch (err) {
    if (!isConsistencyError(err)) throw err;
    return blobsBackend("eventual").get(key);
  }
}

export async function writeToolJson(key: string, data: unknown): Promise<void> {
  const backend = resolveBackend();
  if (backend === memoryBackend) {
    await backend.setJSON(key, data);
    return;
  }
  try {
    await backend.setJSON(key, data);
  } catch (err) {
    if (!isConsistencyError(err)) throw err;
    await blobsBackend("eventual").setJSON(key, data);
  }
}
