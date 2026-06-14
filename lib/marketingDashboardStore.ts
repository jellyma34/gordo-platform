"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { MarketingInvestorsCsvStoredV1 } from "@/lib/marketingInvestorsCsv";
import type { MarketingSegmentExecutionStoredV1, SegmentExecutionChartsPayload } from "@/lib/marketingSegmentExecutionCsv";
import { reconcileSegmentExecutionDoc } from "@/lib/marketingSegmentExecutionCsv";
import type { MarketingUnitsExecutionStoredV1, UnitsExecutionChartsPayload } from "@/lib/marketingUnitsExecutionCsv";
import { reconcileUnitsExecutionDoc, unitsExecutionDocToChartsPayload } from "@/lib/marketingUnitsExecutionCsv";
import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import type { MarketingReceiptsPlanFactStoredV1 } from "@/lib/marketingReceiptsPlanFactCsv";
import type { MarketingLeadsCsvStoredV1 } from "@/lib/marketingLeadsCsv";
import type { MarketingRevenueFactCsvStoredV1 } from "@/lib/marketingRevenueFactCsv";

type SupplementalDocs = {
  investors: MarketingInvestorsCsvStoredV1 | null;
  segmentExecution: MarketingSegmentExecutionStoredV1 | null;
  unitsExecution: MarketingUnitsExecutionStoredV1 | null;
  apartments: MarketingApartmentsCsvStoredV1 | null;
  parking: MarketingParkingCsvStoredV1 | null;
  storages: MarketingStoragesCsvStoredV1 | null;
  receiptsPlanFact: MarketingReceiptsPlanFactStoredV1 | null;
  marketingLeads: MarketingLeadsCsvStoredV1 | null;
  revenueFact: MarketingRevenueFactCsvStoredV1 | null;
};

type SupplementalCharts = {
  segmentExecutionCharts: SegmentExecutionChartsPayload | null;
  unitsExecutionCharts: UnitsExecutionChartsPayload | null;
};

function stripRawText<T extends { rawText?: string }>(doc: T | null): T | null {
  if (!doc) return null;
  const { rawText: _rawText, ...rest } = doc;
  return rest as T;
}

function buildSegmentExecutionCharts(doc: MarketingSegmentExecutionStoredV1 | null): SegmentExecutionChartsPayload | null {
  if (!doc) return null;
  const segDoc = reconcileSegmentExecutionDoc(doc);
  return {
    planFactRows: segDoc.planFactRows,
    completionRows: segDoc.completionRows,
    monthlyByPeriodKey: segDoc.monthlyByPeriodKey,
    hasSegmentPlan: segDoc.hasSegmentPlan,
    planTotal: segDoc.planTotal,
    totalFact: segDoc.totalFact,
  };
}

function buildUnitsExecutionCharts(doc: MarketingUnitsExecutionStoredV1 | null): UnitsExecutionChartsPayload | null {
  if (!doc) return null;
  const fresh = reconcileUnitsExecutionDoc(doc);
  return unitsExecutionDocToChartsPayload(fresh);
}

export type MarketingDashboardStoreState = {
  projectId: string | null;
  hydratedAt: string | null;
  loading: boolean;
  error: string | null;
  docs: SupplementalDocs;
  charts: SupplementalCharts;
};

export type MarketingDashboardStoreActions = {
  setProjectId: (projectId: string) => void;
  hydrateSupplemental: (opts: { projectId: string; force?: boolean }) => Promise<void>;
  applySupplementalDocs: (opts: { projectId: string; docs: SupplementalDocs }) => void;
  clear: () => void;
};

const emptyDocs: SupplementalDocs = {
  investors: null,
  segmentExecution: null,
  unitsExecution: null,
  apartments: null,
  parking: null,
  storages: null,
  receiptsPlanFact: null,
  marketingLeads: null,
  revenueFact: null,
};

const emptyCharts: SupplementalCharts = {
  segmentExecutionCharts: null,
  unitsExecutionCharts: null,
};

export const useMarketingDashboardStore = create<MarketingDashboardStoreState & MarketingDashboardStoreActions>()(
  persist(
    (set, get) => ({
      projectId: null,
      hydratedAt: null,
      loading: false,
      error: null,
      docs: emptyDocs,
      charts: emptyCharts,

      setProjectId: (projectId) => {
        const safe = String(projectId || "default").trim().slice(0, 64) || "default";
        const cur = get().projectId;
        if (cur === safe) return;
        set({
          projectId: safe,
          hydratedAt: null,
          error: null,
          docs: emptyDocs,
          charts: emptyCharts,
        });
      },

      applySupplementalDocs: ({ projectId, docs }) => {
        const safe = String(projectId || "default").trim().slice(0, 64) || "default";
        const strippedDocs: SupplementalDocs = {
          investors: stripRawText(docs.investors),
          segmentExecution: stripRawText(docs.segmentExecution),
          unitsExecution: stripRawText(docs.unitsExecution),
          apartments: stripRawText(docs.apartments),
          parking: stripRawText(docs.parking),
          storages: stripRawText(docs.storages),
          receiptsPlanFact: stripRawText(docs.receiptsPlanFact),
          marketingLeads: stripRawText(docs.marketingLeads),
          revenueFact: stripRawText(docs.revenueFact),
        };
        const segmentExecutionCharts = buildSegmentExecutionCharts(docs.segmentExecution);
        const unitsExecutionCharts = buildUnitsExecutionCharts(docs.unitsExecution);
        set({
          projectId: safe,
          hydratedAt: new Date().toISOString(),
          error: null,
          docs: strippedDocs,
          charts: { segmentExecutionCharts, unitsExecutionCharts },
        });
      },

      hydrateSupplemental: async ({ projectId, force }) => {
        const safe = String(projectId || "default").trim().slice(0, 64) || "default";
        const state = get();
        if (!force && state.loading) return;
        set({ loading: true, error: null });
        try {
          const { hydrateSupplementalMarketingDatasets } = await import("@/lib/analytics/hydrateMarketingFromServer");
          const serverDatasets = await hydrateSupplementalMarketingDatasets(safe);
          get().applySupplementalDocs({
            projectId: safe,
            docs: {
              investors: serverDatasets.investors,
              segmentExecution: serverDatasets.segmentExecution,
              unitsExecution: serverDatasets.unitsExecution,
              apartments: serverDatasets.apartments,
              parking: serverDatasets.parking,
              storages: serverDatasets.storages,
              receiptsPlanFact: serverDatasets.receiptsPlanFact,
              marketingLeads: serverDatasets.marketingLeads,
              revenueFact: serverDatasets.revenueFact,
            },
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          set({ error: err });
        } finally {
          set({ loading: false });
        }
      },

      clear: () => set({ projectId: null, hydratedAt: null, loading: false, error: null, docs: emptyDocs, charts: emptyCharts }),
    }),
    {
      name: "marketingDashboardCache:v1",
      version: 1,
      partialize: (s) => ({
        projectId: s.projectId,
        hydratedAt: s.hydratedAt,
        docs: s.docs,
        charts: s.charts,
      }),
    },
  ),
);

