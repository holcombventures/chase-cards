"use client";

import type { KeyboardEvent } from "react";
import Image from "next/image";
import type { CardWithPrice } from "@/lib/types";
import { formatPrice, formatPriceLabel, formatVariant } from "@/lib/prices";

type Props = {
  card: CardWithPrice;
  rank?: number;
  /** Soft-lock teaser: blur image/price and show lock badge */
  locked?: boolean;
  /** Chase-row foil/glow on unlocked ranked cards (#1–3 free, or all Premium chase) */
  foil?: boolean;
  /** Open lightbox preview (unlocked tiles only) */
  onOpen?: (card: CardWithPrice) => void;
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function formatSetNumberLabel(card: CardWithPrice): string {
  const num = card.number?.trim() || "?";
  const printed = card.set?.printedTotal;
  const total = card.set?.total;
  const denom =
    typeof printed === "number" && Number.isFinite(printed) && printed > 0
      ? printed
      : typeof total === "number" && Number.isFinite(total) && total > 0
        ? total
        : null;
  return denom === null ? num : `${num}/${denom}`;
}

export function CardTile({ card, rank, locked = false, foil = false, onOpen }: Props) {
  const setLabel = formatSetNumberLabel(card);
  const hasPrice = card.marketPrice !== null;
  const showFoil = foil && !locked;
  const openable = Boolean(onOpen) && !locked;

  return (
    <article
      className={[
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-800/80 to-slate-950/90 shadow-lg shadow-black/30 transition",
        locked
          ? "border-white/5 opacity-90"
          : showFoil
            ? "border-amber-400/35 shadow-amber-900/25 ring-1 ring-amber-400/20 hover:-translate-y-0.5 hover:border-amber-400/55 hover:shadow-amber-800/30"
            : "border-white/10 hover:-translate-y-0.5 hover:border-amber-400/40 hover:shadow-amber-900/20",
        openable ? "cursor-pointer focus-within:ring-2 focus-within:ring-amber-300/60" : "",
      ].join(" ")}
      aria-label={
        locked
          ? typeof rank === "number"
            ? `Locked chase card #${rank}`
            : "Locked chase card"
          : openable
            ? `View ${card.name}`
            : undefined
      }
      {...(openable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: () => onOpen?.(card),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.(card);
              }
            },
          }
        : {})}
    >
      {showFoil ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(135deg,transparent_35%,rgba(251,191,36,0.14)_50%,transparent_65%)] opacity-80"
        />
      ) : null}

      {typeof rank === "number" ? (
        <div className="absolute left-2 top-2 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-950 shadow">
          #{rank}
        </div>
      ) : null}

      {locked ? (
        <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-slate-950/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          <LockIcon className="h-3 w-3" />
          Locked
        </div>
      ) : null}

      {!locked && card.rarity ? (
        <div
          className={[
            "absolute z-10 max-w-[calc(100%-3.5rem)] overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-white/15 bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-100 backdrop-blur-sm",
            typeof rank === "number" ? "right-2 top-2" : "left-2 top-2",
          ].join(" ")}
          title={card.rarity}
        >
          {card.rarity}
        </div>
      ) : null}

      <div className="relative aspect-[5/7] w-full bg-slate-900">
        <Image
          src={card.images.large || card.images.small}
          alt={locked ? "Locked chase card" : card.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
          className={[
            "object-contain transition",
            locked
              ? "scale-105 p-1.5 blur-md brightness-50 saturate-50"
              : "p-1 group-hover:scale-[1.02] sm:p-1.5",
          ].join(" ")}
          unoptimized
        />
        {locked ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-slate-950/75 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <LockIcon className="h-3.5 w-3.5" />
              Premium
            </span>
          </div>
        ) : null}
      </div>

      <div className="relative z-[2] flex flex-1 flex-col gap-1 border-t border-white/5 p-3">
        <h3
          className={`truncate text-sm font-semibold text-white sm:text-[15px] ${locked ? "blur-[3px] select-none" : ""}`}
          title={locked ? undefined : card.name}
        >
          {locked ? "••••••••" : card.name}
        </h3>
        <p
          className={`text-xs text-slate-400 ${locked ? "blur-[2px] select-none" : ""}`}
        >
          {locked ? "??/??" : setLabel}
        </p>
        <div className="mt-auto pt-2">
          {locked ? (
            <div
              className="rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-2"
              aria-hidden
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Price
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                <LockIcon className="h-3.5 w-3.5 shrink-0 text-amber-200/70" />
                Locked
              </p>
            </div>
          ) : hasPrice ? (
            <div className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 shadow-inner shadow-amber-950/20">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
                {card.priceVariant &&
                card.priceVariant.toLowerCase() !== "market"
                  ? formatVariant(card.priceVariant)
                  : "Price"}
              </p>
              <p className="text-xl font-bold tabular-nums leading-tight text-amber-300 sm:text-2xl">
                {formatPrice(card.marketPrice)}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Price
              </p>
              <p className="text-sm font-medium text-slate-400">
                {formatPriceLabel(null)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Pricing not available yet
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
