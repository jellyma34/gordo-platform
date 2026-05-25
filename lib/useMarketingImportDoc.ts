"use client";

import { useCallback, useEffect, useState } from "react";

import { hydrateMarketingDocFromPublicCsv } from "@/lib/analytics/hydrateMarketingDocFromPublicCsv";
import {
  deleteMarketingImport,
  fetchMarketingStorage,
  uploadMarketingImportFile,
} from "@/lib/marketingCsvServerClient";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

type Options<T> = {
  projectId: string;
  datasetKey: string;
  importKind: MarketingImportKind;
  validate: (doc: unknown) => doc is T;
  /** @deprecated Legacy localStorage migration — не используется в production hydration. */
  readLocalForMigration?: (projectId: string) => T | null;
  clearLocal?: (projectId: string) => void;
  uploadedBy?: string;
};

export function useMarketingImportDoc<T>(opts: Options<T>) {
  const {
    projectId,
    datasetKey,
    importKind,
    validate,
    readLocalForMigration,
    clearLocal,
    uploadedBy = "—",
  } = opts;

  const [doc, setDoc] = useState<T | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setHydrated(false);
    setError(null);
    try {
      // 1. Production source of truth: static CSV в public/data/analytics/
      const fromPublic = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
      if (fromPublic.ok) {
        setDoc(fromPublic.doc);
        return;
      }
      if (fromPublic.reason === "parse_failed" && fromPublic.error) {
        setError(fromPublic.error);
      }

      // 2. Fallback: API storage (server-side cache / legacy)
      const res = await fetchMarketingStorage(projectId);
      if (res.ok && res.datasets) {
        const fromServer = res.datasets[datasetKey];
        if (validate(fromServer)) {
          setDoc(fromServer);
          return;
        }
      }

      setDoc(null);
    } finally {
      setHydrated(true);
    }
  }, [datasetKey, importKind, projectId, validate]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const uploadFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const result = await uploadMarketingImportFile(projectId, importKind, file, uploadedBy);
        if (!result.ok) {
          setError(result.error);
          return { ok: false as const, error: result.error, diagnostics: result.diagnostics };
        }
        if (validate(result.doc)) {
          setDoc(result.doc);
        }
        return { ok: true as const, doc: result.doc };
      } finally {
        setLoading(false);
      }
    },
    [importKind, projectId, uploadedBy, validate],
  );

  const clearImport = useCallback(async () => {
    setError(null);
    const result = await deleteMarketingImport(projectId, importKind);
    if (!result.ok) {
      setError(result.error);
      return result;
    }
    if (clearLocal) clearLocal(projectId);
    setDoc(null);
    return result;
  }, [clearLocal, importKind, projectId]);

  return {
    doc,
    setDoc,
    hydrated,
    loading,
    error,
    setError,
    uploadFile,
    clearImport,
    refresh: hydrate,
  };
}
