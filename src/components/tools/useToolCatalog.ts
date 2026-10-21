"use client";

import { useEffect, useState } from "react";
import type { CardsApiMeta } from "@/lib/cardCacheModel";
import { pickDefaultSetId } from "@/lib/defaultSet";
import type { CategoryId } from "@/lib/catalog/types";
import type { ToolCategoryId } from "@/lib/tools/categories";
import type { CardWithPrice, PokemonSet } from "@/lib/types";

type SetsBody = { data?: PokemonSet[]; error?: string };
type CardsBody = { data?: CardWithPrice[]; meta?: CardsApiMeta; error?: string };
type Phase = "sets" | "cards" | "ready" | "error";

type State = {
  category: string;
  sets: PokemonSet[];
  setId: string;
  cards: CardWithPrice[];
  meta: CardsApiMeta | null;
  error: string | null;
  phase: Phase;
};

const INITIAL: State = {
  category: "pokemon",
  sets: [],
  setId: "",
  cards: [],
  meta: null,
  error: null,
  phase: "sets",
};

type CatalogResult<T extends string> = {
  category: T;
  sets: PokemonSet[];
  setId: string;
  cards: CardWithPrice[];
  meta: CardsApiMeta | null;
  error: string | null;
  selected: PokemonSet | null;
  loading: boolean;
  setCategory: (category: T) => void;
  setSetId: (setId: string) => void;
};

export function useToolCatalog<T extends string>(options: {
  categories: readonly T[];
}): CatalogResult<T>;
export function useToolCatalog(): CatalogResult<ToolCategoryId>;
export function useToolCatalog<T extends string = ToolCategoryId>(options?: {
  categories?: readonly T[];
}): CatalogResult<T> {
  const allowed = options?.categories;
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    if (state.phase !== "sets") return;
    const controller = new AbortController();
    const category = state.category;
    fetch(`/api/sets?category=${encodeURIComponent(category)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as SetsBody;
        if (!res.ok || !Array.isArray(body.data)) {
          throw new Error(body.error || "Could not load sets.");
        }
        return body.data;
      })
      .then((list) => {
        if (controller.signal.aborted) return;
        setState((current) => {
          if (current.category !== category || current.phase !== "sets") return current;
          return {
            ...current,
            sets: list,
            setId: pickDefaultSetId(list, category as CategoryId),
            cards: [],
            meta: null,
            error: null,
            phase: list.length ? "cards" : "error",
            ...(list.length ? {} : { error: "No sets are available for this game." }),
          };
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Could not load sets.";
        setState((current) => {
          if (current.category !== category || current.phase !== "sets") return current;
          return { ...current, sets: [], error: message, phase: "error" };
        });
      });
    return () => controller.abort();
  }, [state.category, state.phase]);

  useEffect(() => {
    if (state.phase !== "cards" || !state.setId) return;
    const selected = state.sets.find((set) => set.id === state.setId);
    if (!selected) return;
    const controller = new AbortController();
    const category = state.category;
    const setId = selected.id;
    const params = new URLSearchParams({ category });
    if (selected.releaseDate) params.set("releaseDate", selected.releaseDate);
    if (selected.name) params.set("setName", selected.name);
    fetch(`/api/sets/${encodeURIComponent(setId)}/cards?${params}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as CardsBody;
        if (!res.ok || !Array.isArray(body.data)) {
          throw new Error(body.error || "Could not load cards.");
        }
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setState((current) => {
          if (current.category !== category || current.setId !== setId || current.phase !== "cards") {
            return current;
          }
          return {
            ...current,
            cards: body.data ?? [],
            meta: body.meta ?? null,
            error: null,
            phase: "ready",
          };
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Could not load cards.";
        setState((current) => {
          if (current.category !== category || current.setId !== setId || current.phase !== "cards") {
            return current;
          }
          return { ...current, cards: [], meta: null, error: message, phase: "error" };
        });
      });
    return () => controller.abort();
  }, [state.category, state.phase, state.setId, state.sets]);

  const selected = state.sets.find((set) => set.id === state.setId) ?? null;

  return {
    category: state.category as T,
    sets: state.sets,
    setId: state.setId,
    cards: state.cards,
    meta: state.meta,
    error: state.error,
    selected,
    loading: state.phase === "sets" || state.phase === "cards",
    setCategory(category: T) {
      if (allowed && !allowed.includes(category)) return;
      setState({
        category,
        sets: [],
        setId: "",
        cards: [],
        meta: null,
        error: null,
        phase: "sets",
      });
    },
    setSetId(setId: string) {
      setState((current) => ({
        ...current,
        setId,
        cards: [],
        meta: null,
        error: null,
        phase: "cards",
      }));
    },
  };
}
