/** Browser fetch with retries for transient 5xx / network failures. */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { retries?: number; retryStatuses?: number[] }
): Promise<{ res: Response; body: T }> {
  const retries = opts?.retries ?? 4;
  const retryStatuses = new Set(opts?.retryStatuses ?? [408, 425, 429, 500, 502, 503, 504]);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      const text = await res.text();
      let body: T;
      try {
        body = (text ? JSON.parse(text) : {}) as T;
      } catch {
        body = {} as T;
      }

      if (!res.ok && retryStatuses.has(res.status) && attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }

      return { res, body };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Network error loading data. Please retry.");
}
