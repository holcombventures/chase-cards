"use client";

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import Image from "next/image";
import type { CardWithPrice } from "@/lib/types";
import { formatPrice, formatPriceLabel, formatVariant } from "@/lib/prices";

type Props = {
  card: CardWithPrice;
  rank?: number;
  onClose: () => void;
};

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

export function CardLightbox({ card, rank, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const hasPrice = card.marketPrice !== null;
  const setLabel = formatSetNumberLabel(card);
  const setName = card.set?.name?.trim() || null;

  useEffect(() => {
    previousFocus.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    closeRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      const el = previousFocus.current;
      if (el && typeof el.focus === "function") {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdropPointer = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={onBackdropPointer}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-black/50 sm:max-w-xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/80 text-slate-100 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label="Close card preview"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="relative mx-auto aspect-[5/7] w-full max-w-[min(100%,420px)] shrink-0 bg-slate-950/60 sm:max-h-[min(58dvh,520px)]">
          <Image
            src={card.images.large || card.images.small}
            alt={card.name}
            fill
            sizes="(max-width: 640px) 90vw, 420px"
            className="object-contain p-3 sm:p-4"
            unoptimized
            priority
          />
          {typeof rank === "number" ? (
            <div className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-slate-950 shadow">
              #{rank}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 p-4 sm:p-5">
          <div className="pr-10">
            <h2
              id={titleId}
              className="text-lg font-semibold text-white sm:text-xl"
            >
              {card.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {setLabel}
              {setName ? (
                <span className="text-slate-500"> · {setName}</span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {card.rarity ? (
              <span className="rounded-md border border-white/15 bg-slate-950/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-100">
                {card.rarity}
              </span>
            ) : null}
          </div>

          {hasPrice ? (
            <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
                {card.priceVariant &&
                card.priceVariant.toLowerCase() !== "market"
                  ? formatVariant(card.priceVariant)
                  : "Price"}
              </p>
              <p className="text-2xl font-bold tabular-nums text-amber-300">
                {formatPrice(card.marketPrice)}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Price
              </p>
              <p className="text-sm font-medium text-slate-400">
                {formatPriceLabel(null)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
