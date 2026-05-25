"use client";

import { useCallback, useEffect, useState } from "react";

import { hydrateMarketingDocFromPublicCsv } from "@/lib/analytics/hydrateMarketingDocFromPublicCsv";
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
 * Hydration только из static assets `public/data/analytics/*.csv`.
 * Upload сохраняет на сервер + в public (для следующего git push).
 */
export function useMarketingImportDoc<T>(opts: Options<T>) {
  const { projectId, importKind, validate, uploadedBy = "—" } = opts;

  const [doc, setDoc] = useState<T | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setHydrated(false);
    setError(null);
    try {
      const fromPublic = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
      if (fromPublic.ok) {
        setDoc(fromPublic.doc);
        return;
      }
      if (fromPublic.error) {
        setError(fromPublic.error);
      }
      setDoc(null);
    } finally {
      setHydrated(true);
    }
  }, [importKind, projectId, validate]);

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
