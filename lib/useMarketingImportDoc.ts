"use client";

import { useCallback, useEffect, useState } from "react";

import {
  deleteMarketingImport,
  fetchMarketingStorage,
  migrateMarketingImportDoc,
  uploadMarketingImportFile,
} from "@/lib/marketingCsvServerClient";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

type Options<T> = {
  projectId: string;
  datasetKey: string;
  importKind: MarketingImportKind;
  validate: (doc: unknown) => doc is T;
  readLocalForMigration: (projectId: string) => T | null;
  clearLocal: (projectId: string) => void;
  uploadedBy?: string;
};

export function useMarketingImportDoc<T>(opts: Options<T>) {
  const { projectId, datasetKey, importKind, validate, readLocalForMigration, clearLocal, uploadedBy = "—" } =
    opts;

  const [doc, setDoc] = useState<T | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setHydrated(false);
    try {
      const res = await fetchMarketingStorage(projectId);
      if (!res.ok || !res.datasets) {
        setDoc(null);
        return;
      }
      const fromServer = res.datasets[datasetKey];
      if (validate(fromServer)) {
        setDoc(fromServer);
        return;
      }

      const local = readLocalForMigration(projectId);
      if (local) {
        const migrated = await migrateMarketingImportDoc(projectId, importKind, local, uploadedBy);
        if (migrated.ok && validate(migrated.doc)) {
          clearLocal(projectId);
          setDoc(migrated.doc);
          return;
        }
      }
      setDoc(null);
    } finally {
      setHydrated(true);
    }
  }, [clearLocal, datasetKey, importKind, projectId, readLocalForMigration, uploadedBy, validate]);

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
    clearLocal(projectId);
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
