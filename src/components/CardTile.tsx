"use client";

import Image from "next/image";
import type { CardWithPrice } from "@/lib/types";
import { formatPrice, formatVariant } from "@/lib/prices";

type Props = {
  card: CardWithPrice;
  rank?: number;
  /** Soft-lock teaser: blur image/price and show lock badge */
  locked?: boolean;
};

export function CardTile({ card, rank, locked = false }: Props) {
  const setLabel = `${card.number}/${card.set.printedTotal}`;
  const hasPrice = card.marketPrice !== null;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/80 to-slate-950/90 shadow-lg shadow-black/30 transition ${
        locked
          ? "border-white/5 opacity-90"
          : "hover:-translate-y-0.5 hover:border-amber-400/40 hover:shadow-amber-900/20"
      }`}
    >
      {typeof rank === "number" ? (
        <div className="absolute left-2 top-2 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-950 shadow">
          #{rank}
        </div>
      ) : null}

      {locked ? (
        <div className="absolute right-2 top-2 z-10 rounded-full border border-amber-400/40 bg-slate-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
          Locked
        </div>
      ) : null}

      <div className="relative aspect-[5/7] w-full bg-slate-900">
        <Image
          src={card.images.large || card.images.small}
          alt={locked ? "Locked chase card" : card.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
          className={`object-contain p-2 transition ${
            locked
              ? "scale-105 blur-md brightness-50 saturate-50"
              : "group-hover:scale-[1.02]"
          }`}
          unoptimized
        />
        {locked ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35">
            <span className="rounded-full border border-amber-400/30 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-amber-200">
              Premium
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-white/5 p-3">
        <h3
          className={`truncate text-sm font-semibold text-white ${locked ? "blur-[3px] select-none" : ""}`}
          title={locked ? undefined : card.name}
        >
          {locked ? "••••••••" : card.name}
        </h3>
        <p className={`text-xs text-slate-400 ${locked ? "blur-[2px] select-none" : ""}`}>
          {locked ? "??/??" : setLabel}
          {!locked && card.rarity ? ` · ${card.rarity}` : ""}
        </p>
        <div className="mt-auto pt-2">
          {locked ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Latest market price
              </p>
              <p className="text-sm font-medium text-slate-500">Unlock to view</p>
            </div>
          ) : hasPrice ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/60">
                Latest market price
                {card.priceVariant ? ` · ${formatVariant(card.priceVariant)}` : ""}
              </p>
              <p className="text-lg font-bold tabular-nums text-amber-300">
                {formatPrice(card.marketPrice)}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Latest market price
              </p>
              <p className="text-sm font-medium text-slate-500">Price unavailable</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
