"use client";

import type { ReactNode } from "react";

import { MarketingPdfSectionBlock } from "@/components/reports/MarketingPdfSectionBlock";
import { SalesPlanSegmentStructure } from "@/components/marketing/SalesPlanSegmentStructure";
import { DduSalesChart } from "@/components/marketing/dduRevenue/DduSalesChart";
import { ProjectCostAnalyticsSection } from "@/components/marketing/projectCost/ProjectCostAnalyticsSection";
import { SalesPlanExecutionSection } from "@/components/marketing/salesPlanExecution/SalesPlanExecutionSection";
import { SalesPlanCashflowDynamicsChart } from "@/components/marketing/SalesPlanCashflowDynamicsChart";
import { InstallmentForecastSection } from "@/components/marketing/installmentForecast/InstallmentForecastSection";
import { ReportingPeriodPlanExecutionSection } from "@/components/marketing/reportingPeriodPlanExecution/ReportingPeriodPlanExecutionSection";
import { SalesPlanSegmentPlanFactBarChart } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import { SalesDealsSegmentMonthStackCharts } from "@/components/marketing/SalesDealsSegmentMonthStackCharts";
import { SalesPlanExecutionBlock } from "@/components/marketing/SalesPlanExecutionBlock";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { MarketingDealsJsonFeed } from "@/components/marketing/useMarketingDealsJson";
import type { CashflowSeriesRow } from "@/lib/buildCashflowSeries";
import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import type { MarketingPaymentZaydetMonthVerifyRow } from "@/lib/paymentScheduleCsv";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import type { SalesPlanExecutionDataset } from "@/lib/marketingSalesPlanExecutionTable";
import type { SegmentExecutionChartsPayload } from "@/lib/marketingSegmentExecutionCsv";
import type { UnitsExecutionChartsPayload } from "@/lib/marketingUnitsExecutionCsv";
import type { MarketingLeadsCsvChartBundle } from "@/lib/marketingLeadsCsv";
import type { ApartmentPlanPeriodKpiUiData } from "@/lib/apartmentsPlanPeriodKpi";
import type { ParkingPlanAnalyticsBreakdown } from "@/lib/parkingPlanAnalytics";
import type { ParkingPlanPeriodKpiUiData } from "@/lib/parkingPlanPeriodKpi";
import type { StoragePlanAnalyticsBreakdown } from "@/lib/storagePlanAnalytics";
import type { StoragePlanPeriodKpiUiData } from "@/lib/storagePlanPeriodKpi";
import type { ProjectPlanPeriodKpiUiData } from "@/lib/projectPlanPeriodKpi";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { MarketingApartmentsCsvStoredV1 } from "@/lib/marketingApartmentsCsv";
import type { MarketingParkingCsvStoredV1 } from "@/lib/marketingParkingCsv";
import type { MarketingStoragesCsvStoredV1 } from "@/lib/marketingStoragesCsv";
import type { MarketingRevenueFactCsvStoredV1 } from "@/lib/marketingRevenueFactCsv";
import {
  buildMarketingPdfObjectSegmentVariants,
  MARKETING_PDF_CHART_MODE_LABELS,
  MARKETING_PDF_CHART_MODES,
  marketingPdfSnapshotKey,
} from "@/utils/pdf/marketingPdfSections";
import { MARKETING_PDF_ROOT_ATTR } from "@/utils/pdf/marketingPdfRenderProps";

export type SalesPlanMarketingPdfBlocksProps = {
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  currentPeriodKey: string;
  dealsFeed: MarketingDealsJsonFeed;
  marketingDealsFiltered: readonly NormalizedDealRow[];
  apartmentsCsvDoc: MarketingApartmentsCsvStoredV1 | null;
  parkingCsvDoc: MarketingParkingCsvStoredV1 | null;
  storagesCsvDoc: MarketingStoragesCsvStoredV1 | null;
  commercialInventoryUnits: number | null;
  revenueFactCsvDoc: MarketingRevenueFactCsvStoredV1 | null;
  paymentPlanProjectId: string;
  cashflowSeriesBase: CashflowSeriesRow[];
  cashflowPlanScale: number;
  hasPlanMonths: boolean;
  cashflowPlanNote: string;
  paymentPlanHydrated: boolean;
  hasAnyPaymentCsv: boolean;
  paymentFactUnavailableReason: string | null;
  paymentFactByPeriodKey: Record<string, number> | null;
  installmentFactThroughPeriodKey: string | null;
  paymentZaydetMonthVerify: MarketingPaymentZaydetMonthVerifyRow[] | null;
  monthlyPlanVsFactChart: readonly PlanVsFactMonthlyRubPoint[] | null | undefined;
  planChromeEditMode: boolean;
  receiptsPlanFactHydrated: boolean;
  receiptsPlanFactLoading: boolean;
  receiptsPlanFactMeta: { fileName: string } | null;
  uploadPlanVsFactCsvFile: (file: File) => Promise<void>;
  clearPlanVsFactCsv: () => Promise<void>;
  apartmentPlanPeriodKpi: ApartmentPlanPeriodKpiUiData | null;
  reportingPeriodMonthOptions: readonly string[];
  parkingPlanPeriodKpi: ParkingPlanPeriodKpiUiData | null;
  parkingPlanAnalyticsBreakdown: ParkingPlanAnalyticsBreakdown | null;
  storagePlanPeriodKpi: StoragePlanPeriodKpiUiData | null;
  storagePlanAnalyticsBreakdown: StoragePlanAnalyticsBreakdown | null;
  projectPlanPeriodKpi: ProjectPlanPeriodKpiUiData | null;
  apartmentPlanKpiHydrated: boolean;
  apartmentPlanKpiLoading: boolean;
  apartmentPlanKpiError: string | null;
  apartmentPlanKpiDoc: {
    fileName: string;
    updatedAt: string;
    uploadedBy?: string;
    rows?: unknown[];
    diagnostics?: ApartmentPlanCsvParseDiagnostics | null;
  } | null;
  apartmentPlanKpiFailedDiagnostics: ApartmentPlanCsvParseDiagnostics | null;
  uploadApartmentPlanKpiCsv: (file: File) => Promise<void>;
  clearApartmentPlanKpiCsv: () => Promise<void>;
  reportAsOfYmd: string;
  segmentExecutionCharts: SegmentExecutionChartsPayload | null | undefined;
  segmentExecutionCsvError: string | null;
  segmentExecutionCsvLoading: boolean;
  segmentExecutionCsvMeta: { fileName: string } | null;
  uploadSegmentExecutionCsvFile: (file: File) => Promise<void>;
  clearMarketingSegmentExecutionCsv: () => Promise<void>;
  executionDataset: SalesPlanExecutionDataset;
  unitsExecutionCharts: UnitsExecutionChartsPayload | null | undefined;
  unitsCsvError: string | null;
  marketingLeadsCharts: MarketingLeadsCsvChartBundle;
  marketingLeadsHydrated: boolean;
  marketingLeadsLoading: boolean;
  marketingLeadsMeta: { fileName: string } | null;
  uploadMarketingLeadsCsvHandler: (file: File) => Promise<void>;
  clearMarketingLeadsCsvHandler: () => Promise<void>;
};

const pdfChartProps = { pdfRender: true, hideInteractiveControls: true } as const;

function PdfSegmentChartBlock({
  sectionTitle,
  segmentLabel,
  blockKey,
  children,
}: {
  sectionTitle: string;
  segmentLabel: string;
  blockKey: string;
  children: ReactNode;
}) {
  return (
    <MarketingPdfSectionBlock sectionTitle={sectionTitle} segmentLabel={segmentLabel} blockKey={blockKey}>
      {children}
    </MarketingPdfSectionBlock>
  );
}

function PdfModeChartBlock({
  sectionTitle,
  modeLabel,
  blockKey,
  children,
}: {
  sectionTitle: string;
  modeLabel: string;
  blockKey: string;
  children: ReactNode;
}) {
  return (
    <MarketingPdfSectionBlock sectionTitle={sectionTitle} modeLabel={modeLabel} blockKey={blockKey}>
      {children}
    </MarketingPdfSectionBlock>
  );
}

export function SalesPlanMarketingPdfBlocks(props: SalesPlanMarketingPdfBlocksProps) {
  const {
    presentation,
    presDark,
    mplPremium,
    period,
    objectId,
    currentPeriodKey,
    dealsFeed,
    marketingDealsFiltered: dealsRows,
    apartmentsCsvDoc,
    parkingCsvDoc,
    storagesCsvDoc,
    commercialInventoryUnits,
    revenueFactCsvDoc,
    paymentPlanProjectId,
    cashflowSeriesBase,
    cashflowPlanScale,
    hasPlanMonths,
    cashflowPlanNote,
    paymentPlanHydrated,
    hasAnyPaymentCsv,
    paymentFactUnavailableReason,
    paymentZaydetMonthVerify,
    monthlyPlanVsFactChart,
    planChromeEditMode,
    receiptsPlanFactHydrated,
    receiptsPlanFactLoading,
    receiptsPlanFactMeta,
    uploadPlanVsFactCsvFile,
    clearPlanVsFactCsv,
    apartmentPlanPeriodKpi,
    reportingPeriodMonthOptions,
    parkingPlanPeriodKpi,
    parkingPlanAnalyticsBreakdown,
    storagePlanPeriodKpi,
    storagePlanAnalyticsBreakdown,
    projectPlanPeriodKpi,
    apartmentPlanKpiHydrated,
    apartmentPlanKpiLoading,
    apartmentPlanKpiError,
    apartmentPlanKpiDoc,
    apartmentPlanKpiFailedDiagnostics,
    uploadApartmentPlanKpiCsv,
    clearApartmentPlanKpiCsv,
    reportAsOfYmd,
    segmentExecutionCharts,
    segmentExecutionCsvError,
    segmentExecutionCsvLoading,
    segmentExecutionCsvMeta,
    uploadSegmentExecutionCsvFile,
    clearMarketingSegmentExecutionCsv,
    executionDataset,
    unitsExecutionCharts,
    unitsCsvError,
    marketingLeadsCharts,
    marketingLeadsHydrated,
    marketingLeadsLoading,
    marketingLeadsMeta,
    uploadMarketingLeadsCsvHandler,
    clearMarketingLeadsCsvHandler,
  } = props;

  const objectSegments = buildMarketingPdfObjectSegmentVariants({ includeRoomTypes: true });

  return (
    <div
      className="flex w-[1100px] max-w-none flex-col gap-8 bg-white"
      {...{ [MARKETING_PDF_ROOT_ATTR]: true }}
    >
      <MarketingPdfSectionBlock sectionTitle="Структура сегментов плана продаж" blockKey="segment-structure">
        <SalesPlanSegmentStructure
          presentation={presentation}
          objectId={objectId}
          dealsFeed={dealsFeed}
          apartmentsCsv={apartmentsCsvDoc}
          parkingCsv={parkingCsvDoc}
          storagesCsv={storagesCsvDoc}
          commercialInventoryUnits={commercialInventoryUnits ?? 0}
          showApartmentsShareWarning={false}
          revenueFactCsv={revenueFactCsvDoc}
          csvUploadProjectId={paymentPlanProjectId}
        />
      </MarketingPdfSectionBlock>

      {objectSegments.map((variant) => (
        <PdfSegmentChartBlock
          key={`ddu-${variant.objectType}-${variant.roomType ?? "all"}`}
          sectionTitle="Продажи по заключенным ДДУ, руб."
          segmentLabel={variant.segmentLabel}
          blockKey={marketingPdfSnapshotKey(["ddu", variant.objectType, variant.roomType])}
        >
          <DduSalesChart
            presentation={presentation}
            presDark={presDark}
            mplPremium={mplPremium}
            period={period}
            objectId={objectId}
            currentPeriodKey={currentPeriodKey}
            sectionSpacing="none"
            forcedObjectType={variant.objectType}
            forcedRoomType={variant.roomType}
            {...pdfChartProps}
          />
        </PdfSegmentChartBlock>
      ))}

      {objectSegments
        .filter((v) => !v.roomType || v.roomType === "all")
        .map((variant) => (
          <PdfSegmentChartBlock
            key={`project-cost-${variant.objectType}`}
            sectionTitle="Общая стоимость проекта"
            segmentLabel={variant.segmentLabel}
            blockKey={marketingPdfSnapshotKey(["project-cost", variant.objectType])}
          >
            <ProjectCostAnalyticsSection
              presentation={presentation}
              presDark={presDark}
              mplPremium={mplPremium}
              period={period}
              objectId={objectId}
              currentPeriodKey={currentPeriodKey}
              forcedObjectType={variant.objectType}
              {...pdfChartProps}
            />
          </PdfSegmentChartBlock>
        ))}

      {MARKETING_PDF_CHART_MODES.map((mode) => (
        <PdfModeChartBlock
          key={`plan-exec-${mode}`}
          sectionTitle="Выполнение плана продаж"
          modeLabel={MARKETING_PDF_CHART_MODE_LABELS[mode]}
          blockKey={marketingPdfSnapshotKey(["plan-exec", mode])}
        >
          <SalesPlanExecutionSection
            presentation={presentation}
            presDark={presDark}
            mplPremium={mplPremium}
            period={period}
            objectId={objectId}
            currentPeriodKey={currentPeriodKey}
            monthlyPlanVsFact={monthlyPlanVsFactChart}
            dealRows={dealsFeed.loading ? [] : dealsRows}
            hasPlanFactCsv={receiptsPlanFactMeta != null}
            isEditMode={planChromeEditMode}
            planFactCsvHydrated={receiptsPlanFactHydrated}
            planFactCsvLoading={receiptsPlanFactLoading}
            onPlanFactCsvUpload={uploadPlanVsFactCsvFile}
            onPlanFactCsvClear={clearPlanVsFactCsv}
            forcedChartMode={mode}
            {...pdfChartProps}
          />
        </PdfModeChartBlock>
      ))}

      {MARKETING_PDF_CHART_MODES.map((mode) => (
        <PdfModeChartBlock
          key={`cashflow-${mode}`}
          sectionTitle="Динамика поступлений от заключенным договорам"
          modeLabel={MARKETING_PDF_CHART_MODE_LABELS[mode]}
          blockKey={marketingPdfSnapshotKey(["cashflow", mode])}
        >
          <SalesPlanCashflowDynamicsChart
            rows={cashflowSeriesBase}
            planScale={cashflowPlanScale}
            includePlanSeries={hasPlanMonths}
            planSourceNote={cashflowPlanNote}
            factThroughPeriodKey={null}
            factUnavailableMessage={
              paymentPlanHydrated && hasAnyPaymentCsv ? paymentFactUnavailableReason : null
            }
            presentation={presentation}
            zaydetMonthVerify={paymentZaydetMonthVerify}
            showZaydetCsvDebugTable={false}
            forcedChartMode={mode}
            {...pdfChartProps}
          />
        </PdfModeChartBlock>
      ))}

      <MarketingPdfSectionBlock sectionTitle="Прогноз поступлений по заключенным договорам" blockKey="installment-forecast">
        <InstallmentForecastSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplPremium}
          isEditMode={planChromeEditMode}
          period={period}
          factByPeriodKey={props.paymentFactByPeriodKey}
          factThroughPeriodKey={props.installmentFactThroughPeriodKey}
        />
      </MarketingPdfSectionBlock>

      {apartmentPlanPeriodKpi
        ? reportingPeriodMonthOptions.map((monthKey) => (
            <MarketingPdfSectionBlock
              key={`reporting-${monthKey}`}
              sectionTitle="Выполнение плана отчетного периода"
              monthLabel={periodKeyToRuChartLabel(monthKey)}
              blockKey={marketingPdfSnapshotKey(["reporting-period", monthKey])}
            >
              <ReportingPeriodPlanExecutionSection
                data={apartmentPlanPeriodKpi}
                presentation={presentation}
                presDark={presDark}
                mplPremium={mplPremium}
                monthKey={monthKey}
                monthOptions={reportingPeriodMonthOptions}
                isEditMode={planChromeEditMode}
                csvHydrated={apartmentPlanKpiHydrated}
                csvLoading={apartmentPlanKpiLoading}
                csvError={apartmentPlanKpiError}
                csvMeta={
                  apartmentPlanKpiDoc
                    ? {
                        fileName: apartmentPlanKpiDoc.fileName,
                        updatedAt: apartmentPlanKpiDoc.updatedAt,
                        uploadedBy: apartmentPlanKpiDoc.uploadedBy,
                      }
                    : null
                }
                hasCsv={apartmentPlanKpiDoc != null && (apartmentPlanKpiDoc.rows?.length ?? 0) > 0}
                onCsvUpload={uploadApartmentPlanKpiCsv}
                onCsvClear={clearApartmentPlanKpiCsv}
                csvDiagnostics={apartmentPlanKpiDoc?.diagnostics ?? apartmentPlanKpiFailedDiagnostics ?? null}
                parkingPlanPeriodKpi={parkingPlanPeriodKpi}
                parkingPlanAnalyticsBreakdown={parkingPlanAnalyticsBreakdown}
                storagePlanPeriodKpi={storagePlanPeriodKpi}
                storagePlanAnalyticsBreakdown={storagePlanAnalyticsBreakdown}
                projectPlanPeriodKpi={projectPlanPeriodKpi}
                forceExpanded
                hideInteractiveControls
              />
            </MarketingPdfSectionBlock>
          ))
        : null}

      {!dealsFeed.loading ? (
        <MarketingPdfSectionBlock sectionTitle="Выполнение плана продаж по сегментам" blockKey="segment-plan-fact-bar">
          <SalesPlanSegmentPlanFactBarChart
            dealsRows={[...dealsRows]}
            fallbackTotalPlanRub={null}
            marketingPeriod={period}
            planReportAsOfYmd={reportAsOfYmd}
            presentation={presentation}
            unitsExecutionCharts={unitsExecutionCharts ?? null}
            segmentExecutionCharts={segmentExecutionCharts ?? null}
            isEditMode={false}
            segmentExecutionCsvLoading={segmentExecutionCsvLoading}
            hasSegmentExecutionCsv={segmentExecutionCsvMeta != null}
            onSegmentExecutionCsvUpload={uploadSegmentExecutionCsvFile}
            onSegmentExecutionCsvClear={clearMarketingSegmentExecutionCsv}
          />
        </MarketingPdfSectionBlock>
      ) : null}

      {!dealsFeed.loading ? (
        <MarketingPdfSectionBlock sectionTitle="Сделки" blockKey="deals-segment-month">
          <SalesDealsSegmentMonthStackCharts dealsRows={[...dealsRows]} presentation={presentation} />
        </MarketingPdfSectionBlock>
      ) : null}

      <SalesPlanExecutionBlock
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplPremium}
        showDetailTable={false}
        dataset={executionDataset}
        monthlyPlanVsFact={monthlyPlanVsFactChart}
        segmentExecutionCharts={segmentExecutionCharts}
        segmentExecutionCsvError={segmentExecutionCsvError}
        unitsExecutionCharts={unitsExecutionCharts}
        unitsExecutionDealsRows={dealsFeed.loading ? [] : dealsRows}
        unitsCsvError={unitsCsvError}
        isEditMode={planChromeEditMode}
        planFactCsvHydrated={receiptsPlanFactHydrated}
        planFactCsvLoading={receiptsPlanFactLoading}
        hasPlanFactCsv={receiptsPlanFactMeta != null}
        onPlanFactCsvUpload={uploadPlanVsFactCsvFile}
        onPlanFactCsvClear={clearPlanVsFactCsv}
        marketingLeadsCharts={marketingLeadsCharts}
        marketingLeadsCsvHydrated={marketingLeadsHydrated}
        marketingLeadsCsvLoading={marketingLeadsLoading}
        hasMarketingLeadsCsv={marketingLeadsMeta != null}
        onMarketingLeadsCsvUpload={uploadMarketingLeadsCsvHandler}
        onMarketingLeadsCsvClear={clearMarketingLeadsCsvHandler}
        period={period}
        objectId={objectId}
        pdfRender
      />
    </div>
  );
}
