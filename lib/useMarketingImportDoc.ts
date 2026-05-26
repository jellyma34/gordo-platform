"use client";

import { useCallback, useEffect, useState } from "react";

import { hydrateMarketingDocFromServer } from "@/lib/analytics/hydrateMarketingFromServer";
import { loadAnalyticsRegistry } from "@/lib/analytics/loadAnalyticsRegistry";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { deleteMarketingImport, uploadMarketingImportFile } from "@/lib/marketingCsvServerClient";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

type Options<T> = {
  projectId: string;
  datasetKey: string;
  importKind: MarketingImportKind;
  validate: (doc: unknown) => doc is T;
  uploadedBy?: string;
};

/**
 * Hydration: server storage API (runtime FS + `public/data/analytics/`),
 * fallback — static assets из git/deploy.
 * Upload → POST marketing/storage → persist CSV → refresh.
 */
export function useMarketingImportDoc<T>(opts: Options<T>) {
  const { projectId, importKind, validate, uploadedBy = "—" } = opts;
  const datasetKey = analyticsCsvRegistryEntry(importKind).datasetKey;

  const [doc, setDoc] = useState<T | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setHydrated(false);
    setError(null);
    try {
      const fromServer = await hydrateMarketingDocFromServer(
        projectId,
        importKind,
        datasetKey,
        validate,
      );
      if (fromServer.ok) {
        setDoc(fromServer.doc);
        return;
      }
      if (fromServer.error) {
        setError(fromServer.error);
      }
      setDoc(null);
    } finally {
      setHydrated(true);
    }
  }, [datasetKey, importKind, projectId, validate]);

  useEffect(() => {
    void loadAnalyticsRegistry(projectId).then(() => hydrate());
  }, [hydrate, projectId]);

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
        await hydrate();
        return { ok: true as const, doc: result.doc };
      } finally {
        setLoading(false);
      }
    },
    [hydrate, importKind, projectId, uploadedBy, validate],
  );

  const clearImport = useCallback(async () => {
    setError(null);
    const result = await deleteMarketingImport(projectId, importKind);
    if (!result.ok) {
      setError(result.error);
      return result;
    }
    setDoc(null);
    return result;
  }, [importKind, projectId]);

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
