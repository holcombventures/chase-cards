import type { Metadata } from "next";
import Link from "next/link";
import { GUNDAM_FAN_NOTE, LORCANA_FAN_NOTE } from "@/lib/catalog/types";

export const metadata: Metadata = {
  title: "Free collector tools",
  description:
    "Free box EV, grading ROI, and hype tools for the live catalogs. Estimates, not advice.",
};

const TOOLS = [
  {
    href: "/tools/box-ev",
    title: "Box EV calculator",
    body: "Model a box from live card prices. Pack count, pull rates, and the box price are estimates you edit.",
  },
  {
    href: "/tools/grading-roi",
    title: "Grading ROI checker",
    body: "Compare a live raw price with estimated PSA 10, 9, and 8 values. A checklist sets the likely grade.",
  },
  {
    href: "/tools/hype",
    title: "Hype tracker",
    body: "Score cards from release timing, public tournament lists, and subreddit posts. Watchlist stays on this device.",
  },
] as const;

export default function ToolsIndexPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Collector tools</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Free, with no login. Pokémon, One Piece, Lorcana, Riftbound, and Gundam use the same
          live prices as the chase list.
        </p>
      </header>
      <ul className="grid gap-3">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="block rounded-2xl border border-white/10 bg-slate-950/40 p-4 hover:border-amber-300/40"
            >
              <h2 className="text-lg font-semibold text-white">{tool.title}</h2>
              <p className="mt-1 text-sm text-slate-300">{tool.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="space-y-2 text-xs leading-relaxed text-slate-400">
        <p>{LORCANA_FAN_NOTE}</p>
        <p>{GUNDAM_FAN_NOTE}</p>
      </div>
    </div>
  );
}
