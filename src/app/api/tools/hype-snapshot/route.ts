import { NextResponse } from "next/server";
import { readStoredPriceSnapshot } from "@/lib/priceSnapshotStore";
import { HYPE_CATEGORY_IDS } from "@/lib/tools/categories";
import { loadToolCards, loadToolSets } from "@/lib/tools/catalogLoad";
import { historyDay, readSetHistory, recordPricePoint } from "@/lib/tools/hypeHistory";
import {
  indexIsFresh,
  jobsForSets,
  wrapCursor,
  SNAPSHOT_FRESH_MS,
  type SnapshotIndex,
  type SnapshotJob,
} from "@/lib/tools/hypeSnapshot";
import { readToolJson, writeToolJson } from "@/lib/tools/toolStore";

export const dynamic = "force-dynamic";

const INDEX_KEY = "snapshot-index";
const CURSOR_KEY = "snapshot-cursor";
const LOCK_KEY = "snapshot-lock";
const VISIT_LIMIT = 24;
const UPSTREAM_LIMIT = 3;
const BUDGET_MS = 18_000;
const LOCK_MS = 45_000;

type RunResult = {
  ok: true;
  visited: number;
  recorded: number;
  reused: number;
  upstream: number;
  skipped: number;
  cursor: number;
  jobs: number;
  detail: string;
};

function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function pricesFromSnapshot(data: { id: string; marketPrice: number | null }[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const patch of data) {
    if (typeof patch.marketPrice === "number" && Number.isFinite(patch.marketPrice)) {
      prices[patch.id] = patch.marketPrice;
    }
  }
  return prices;
}

async function readIndex(): Promise<SnapshotIndex | null> {
  const raw = await readToolJson(INDEX_KEY);
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SnapshotIndex>;
  if (value.v !== 1 || typeof value.builtAt !== "number" || !Array.isArray(value.jobs)) return null;
  const jobs = value.jobs.filter(
    (job): job is SnapshotJob =>
      Boolean(job) &&
      typeof job === "object" &&
      typeof (job as SnapshotJob).category === "string" &&
      typeof (job as SnapshotJob).setId === "string",
  );
  return { v: 1, builtAt: value.builtAt, jobs };
}

async function buildIndex(now: number): Promise<SnapshotIndex> {
  const jobs: SnapshotJob[] = [];
  for (const category of HYPE_CATEGORY_IDS) {
    try {
      const sets = await loadToolSets(category);
      jobs.push(...jobsForSets(category, sets, now));
    } catch (err) {
      console.error(`hype snapshot set list failed for ${category}:`, err);
    }
  }
  const index: SnapshotIndex = { v: 1, builtAt: now, jobs };
  await writeToolJson(INDEX_KEY, index);
  return index;
}

async function readCursor(): Promise<number> {
  const raw = await readToolJson(CURSOR_KEY);
  if (!raw || typeof raw !== "object") return 0;
  const index = (raw as { index?: unknown }).index;
  return typeof index === "number" && Number.isFinite(index) ? index : 0;
}

/**
 * Walks a cursor through set price snapshots. A stored snapshot from the last
 * 20 hours is copied into the daily history without calling upstream. At most
 * a few sets are fetched fresh, and the walk stops before the function timeout.
 */
export async function POST() {
  const now = Date.now();
  const started = now;
  try {
    const lock = await readToolJson(LOCK_KEY);
    if (lock && typeof lock === "object" && typeof (lock as { at?: unknown }).at === "number") {
      if (now - (lock as { at: number }).at < LOCK_MS) {
        return NextResponse.json({
          ok: true,
          visited: 0,
          recorded: 0,
          reused: 0,
          upstream: 0,
          skipped: 0,
          cursor: await readCursor(),
          jobs: 0,
          detail: "A snapshot is already running.",
        } satisfies RunResult);
      }
    }
    await writeToolJson(LOCK_KEY, { at: now });

    let index = await readIndex();
    if (!index || !indexIsFresh(index, now)) index = await buildIndex(now);
    const jobs = index.jobs;
    if (!jobs.length) {
      await writeToolJson(LOCK_KEY, { at: 0 });
      return NextResponse.json({
        ok: true,
        visited: 0,
        recorded: 0,
        reused: 0,
        upstream: 0,
        skipped: 0,
        cursor: 0,
        jobs: 0,
        detail: "No sets were available to snapshot.",
      } satisfies RunResult);
    }

    let cursor = wrapCursor(jobs.length, await readCursor());
    const day = todayUtc(now);
    let visited = 0;
    let recorded = 0;
    let reused = 0;
    let upstream = 0;
    let skipped = 0;

    while (visited < VISIT_LIMIT && Date.now() - started < BUDGET_MS) {
      const job = jobs[cursor];
      cursor = wrapCursor(jobs.length, cursor + 1);
      visited += 1;
      try {
        const history = await readSetHistory(job.category, job.setId);
        if (history?.points.some((point) => historyDay(point.at) === day)) {
          skipped += 1;
          continue;
        }
        const snapshot = await readStoredPriceSnapshot(job.category, job.setId);
        const fresh = snapshot && now - snapshot.storedAt <= SNAPSHOT_FRESH_MS;
        if (fresh && snapshot) {
          const prices = pricesFromSnapshot(snapshot.data);
          if (Object.keys(prices).length) {
            await recordPricePoint(job.category, job.setId, { at: day, prices });
            recorded += 1;
            reused += 1;
          }
          continue;
        }
        if (upstream >= UPSTREAM_LIMIT || Date.now() - started > BUDGET_MS - 4000) {
          cursor = wrapCursor(jobs.length, cursor - 1);
          visited -= 1;
          break;
        }
        upstream += 1;
        const loaded = await loadToolCards(job.category, job.setId);
        const prices: Record<string, number> = {};
        for (const card of loaded.cards) {
          if (typeof card.marketPrice === "number" && Number.isFinite(card.marketPrice)) {
            prices[card.id] = card.marketPrice;
          }
        }
        if (Object.keys(prices).length) {
          await recordPricePoint(job.category, job.setId, { at: day, prices });
          recorded += 1;
        }
      } catch (err) {
        console.error(`hype snapshot failed for ${job.category}/${job.setId}:`, err);
      }
    }

    await writeToolJson(CURSOR_KEY, { index: cursor });
    const result: RunResult = {
      ok: true,
      visited,
      recorded,
      reused,
      upstream,
      skipped,
      cursor,
      jobs: jobs.length,
      detail:
        "Scheduled runs keep about 35 daily prices per set. One run stores a short batch so it stays inside the 30 second limit.",
    };
    await writeToolJson(LOCK_KEY, { at: 0 });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Snapshot failed.";
    return NextResponse.json({ ok: false, detail: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    worker: true,
    detail: "POST runs one short price-snapshot batch. The schedule lives on the Netlify function.",
  });
}
