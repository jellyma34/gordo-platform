"use client";

import { useCallback, useEffect, useState } from "react";

import {
  extractNormalizedDeals,
  flattenDealsInput,
  parseDealsEnvelope,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";

export type MarketingDealsJsonFeed = {
  rows: NormalizedDealRow[];
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/** Один запрос `/api/deals` для панели плана и структуры сегментов. */
export function useMarketingDealsJson(): MarketingDealsJsonFeed {
  const [rows, setRows] = useState<NormalizedDealRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deals");
      const json: unknown = await res.json();
      if (!res.ok) {
        setRows([]);
        setError(
          typeof json === "object" && json && "error" in json ? String((json as { error: unknown }).error) : `Ошибка ${res.status}`,
        );
        return;
      }
      let list: unknown[] = parseDealsEnvelope(json);
      if (list.length === 0) list = flattenDealsInput(json);
      setRows(extractNormalizedDeals(list));
    } catch {
      setRows([]);
      setError("Не удалось загрузить сделки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, error, loading, reload: load };
}
