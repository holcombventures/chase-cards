import type { Metadata } from "next";
import Link from "next/link";
import { RIFTBOUND_FAN_NOTE } from "@/lib/catalog/types";

export const metadata: Metadata = {
  title: {
    default: "Free collector tools",
    template: "%s — Chase Cards",
  },
  description:
    "Free box EV, grading ROI, and hype tools. Figures are estimates, not buying or grading advice.",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="text-base font-bold text-white">
            Chase Cards
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/tools" className="font-semibold text-amber-200">
              Tools
            </Link>
            <Link href="/" className="text-slate-300 hover:text-white">
              Chase list
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
      <footer className="mx-auto w-full max-w-5xl space-y-2 px-4 py-8 text-xs leading-relaxed text-slate-400">
        <p>{RIFTBOUND_FAN_NOTE}</p>
        <p>These tools are free. Estimates are not advice.</p>
      </footer>
    </div>
  );
}
