import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  cloneFinanceExecutionKpi,
  emptyFinanceExecutionImport,
  emptyFinanceExecutionKpi,
  financeExecutionKpiHasData,
  type FinanceExecutionChartSegment,
  type FinanceExecutionExpenseChart,
  type FinanceExecutionImport,
  type FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";
import {
  cloneFinanceBudgetLines,
  normalizeFinanceBudgetRowLoose,
  type FinanceBudgetImportMeta,
  type FinanceBudgetLine,
  type FinanceBudgetSnapshot,
} from "@/lib/financeBudgetData";

export { getGprProjectId };

export const FINANCE_BUDGET_SAVED_EVENT = "gordo-finance-budget-saved";
export const FINANCE_BUDGET_EXECUTION_SAVED_EVENT = "gordo-finance-budget-execution-saved";

/** Ключ localStorage для снимка financeBudgetImport. */
export function financeBudgetImportStorageKey(projectId: string): string {
  return `financeBudgetImport_${projectId}`;
}

/** Ключ localStorage для снимка «Исполнение бюджета». */
export function financeBudgetExecutionImportStorageKey(projectId: string): string {
  return `financeBudgetExecutionImport_${projectId}`;
}

/** @deprecated Используйте {@link financeBudgetImportStorageKey}. */
export function financeBudgetStorageKey(projectId: string): string {
  return financeBudgetImportStorageKey(projectId);
}

const LEGACY_FINANCE_BUDGET_STORAGE_PREFIX = "finance_budget_";

function parseStoredSnapshot(raw: string): FinanceBudgetSnapshot | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;

    const body = data as Record<string, unknown>;
    const linesRaw = body.lines ?? body.items;
    if (!Array.isArray(linesRaw)) return null;

    const lines: FinanceBudgetLine[] = [];
    for (const item of linesRaw) {
      const n = normalizeFinanceBudgetRowLoose(item);
      if (n) lines.push(n);
    }

    if (lines.length === 0) return null;

    const importMeta =
      body.importMeta && typeof body.importMeta === "object"
        ? (body.importMeta as FinanceBudgetImportMeta)
        : undefined;

    return {
      lines,
      updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : undefined,
      importMeta,
    };
  } catch {
    return null;
  }
}

export function loadFinanceBudgetFromLocalStorage(projectId: string): FinanceBudgetSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const primaryKey = financeBudgetImportStorageKey(projectId);
    const primaryRaw = window.localStorage.getItem(primaryKey);
    if (primaryRaw) return parseStoredSnapshot(primaryRaw);

    const legacyRaw = window.localStorage.getItem(`${LEGACY_FINANCE_BUDGET_STORAGE_PREFIX}${projectId}`);
    if (legacyRaw) return parseStoredSnapshot(legacyRaw);

    return null;
  } catch {
    return null;
  }
}

export function saveFinanceBudgetToLocalStorage(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = financeBudgetImportStorageKey(projectId);
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(FINANCE_BUDGET_SAVED_EVENT));
  } catch (e) {
    console.warn("[finance] Не удалось сохранить бюджет в localStorage:", e);
  }
}

export type FinanceBudgetImportApiPayload = {
  lines: FinanceBudgetLine[];
  updatedAt?: string;
  importMeta?: FinanceBudgetImportMeta;
};

export async function fetchFinanceBudgetImportFromApi(
  projectId: string,
): Promise<FinanceBudgetSnapshot | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/finance/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as FinanceBudgetImportApiPayload & { items?: FinanceBudgetLine[] };
    const lines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : null;
    if (!lines || lines.length === 0) return null;
    return {
      lines: cloneFinanceBudgetLines(lines),
      updatedAt: body.updatedAt,
      importMeta: body.importMeta,
    };
  } catch {
    return null;
  }
}

export async function postFinanceBudgetImportToApi(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): Promise<boolean> {
  try {
    const res = await fetch("/api/finance/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        lines: snapshot.lines,
        updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
        importMeta: snapshot.importMeta,
      } satisfies FinanceBudgetImportApiPayload & { projectId: string }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BootstrapFinanceBudgetResult = {
  snapshot: FinanceBudgetSnapshot;
  bootstrapJson: string;
};

function emptySnapshot(): FinanceBudgetSnapshot {
  return { lines: [], updatedAt: undefined, importMeta: undefined };
}

/**
 * Цепочка при старте: localStorage → GET Next API (JSON snapshot) → пустой снимок.
 */
export async function loadPersistedFinanceBudget(
  projectId: string,
): Promise<BootstrapFinanceBudgetResult> {
  const ls = loadFinanceBudgetFromLocalStorage(projectId);
  if (ls && ls.lines.length > 0) {
    const snapshot = {
      lines: cloneFinanceBudgetLines(ls.lines),
      updatedAt: ls.updatedAt,
      importMeta: ls.importMeta,
    };
    return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
  }

  const api = await fetchFinanceBudgetImportFromApi(projectId);
  if (api && api.lines.length > 0) {
    const snapshot = {
      lines: cloneFinanceBudgetLines(api.lines),
      updatedAt: api.updatedAt,
      importMeta: api.importMeta,
    };
    return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
  }

  const snapshot = emptySnapshot();
  return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
}

export async function persistFinanceBudgetSnapshot(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): Promise<void> {
  const payload: FinanceBudgetSnapshot = {
    lines: cloneFinanceBudgetLines(snapshot.lines),
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    importMeta: snapshot.importMeta,
  };
  saveFinanceBudgetToLocalStorage(projectId, payload);
  await postFinanceBudgetImportToApi(projectId, payload);
}

function parseChartSegment(raw: unknown): FinanceExecutionChartSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.id !== "string" || typeof body.label !== "string") return null;
  if (typeof body.valueRub !== "number" || typeof body.color !== "string") return null;
  return {
    id: body.id,
    label: body.label,
    legendLabel: typeof body.legendLabel === "string" ? body.legendLabel : undefined,
    valueRub: body.valueRub,
    planRub: typeof body.planRub === "number" ? body.planRub : null,
    color: body.color,
  };
}

function parseSalesChart(raw: unknown): FinanceExecutionSalesChart | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const segmentsRaw = Array.isArray(body.segments) ? body.segments : [];
  const segments = segmentsRaw
    .map((segment) => parseChartSegment(segment))
    .filter((segment): segment is FinanceExecutionChartSegment => segment != null);
  if (segments.length === 0) return null;
  return {
    segments,
    factTotalRub: typeof body.factTotalRub === "number" ? body.factTotalRub : null,
  };
}

function parseExpenseChart(raw: unknown): FinanceExecutionExpenseChart | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const segmentsRaw = Array.isArray(body.segments) ? body.segments : [];
  const segments = segmentsRaw
    .map((segment) => parseChartSegment(segment))
    .filter((segment): segment is FinanceExecutionChartSegment => segment != null);
  if (segments.length === 0 && typeof body.projectTotalCostRub !== "number") return null;
  return {
    segments,
    contractedTotalRub:
      typeof body.contractedTotalRub === "number" ? body.contractedTotalRub : null,
    projectTotalCostRub:
      typeof body.projectTotalCostRub === "number" ? body.projectTotalCostRub : null,
  };
}

function parseStoredExecutionSnapshot(raw: string): FinanceExecutionImport | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;

    const body = data as Record<string, unknown>;
    const kpiRaw = body.kpi;
    if (!kpiRaw || typeof kpiRaw !== "object") return null;

    const kpiBody = kpiRaw as Record<string, unknown>;
    const kpi = cloneFinanceExecutionKpi({
      revenue: typeof kpiBody.revenue === "number" ? kpiBody.revenue : null,
      turnover: typeof kpiBody.turnover === "number" ? kpiBody.turnover : null,
      expenses: typeof kpiBody.expenses === "number" ? kpiBody.expenses : null,
      expenseBankPercent:
        typeof kpiBody.expenseBankPercent === "number" ? kpiBody.expenseBankPercent : null,
      ebit: typeof kpiBody.ebit === "number" ? kpiBody.ebit : null,
      ebitMargin: typeof kpiBody.ebitMargin === "number" ? kpiBody.ebitMargin : null,
      profitBeforeTax:
        typeof kpiBody.profitBeforeTax === "number" ? kpiBody.profitBeforeTax : null,
      profitMargin: typeof kpiBody.profitMargin === "number" ? kpiBody.profitMargin : null,
    });

    if (!financeExecutionKpiHasData(kpi)) return null;

    return {
      title: typeof body.title === "string" ? body.title : undefined,
      reportingDate: typeof body.reportingDate === "string" ? body.reportingDate : undefined,
      kpi,
      salesChart: parseSalesChart(body.salesChart),
      expenseChart: parseExpenseChart(body.expenseChart),
      updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : undefined,
      importMeta:
        body.importMeta && typeof body.importMeta === "object"
          ? (body.importMeta as FinanceExecutionImport["importMeta"])
          : undefined,
    };
  } catch {
    return null;
  }
}

export function loadFinanceBudgetExecutionFromLocalStorage(
  projectId: string,
): FinanceExecutionImport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(financeBudgetExecutionImportStorageKey(projectId));
    if (!raw) return null;
    return parseStoredExecutionSnapshot(raw);
  } catch {
    return null;
  }
}

export function saveFinanceBudgetExecutionToLocalStorage(
  projectId: string,
  snapshot: FinanceExecutionImport,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = financeBudgetExecutionImportStorageKey(projectId);
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(FINANCE_BUDGET_EXECUTION_SAVED_EVENT));
  } catch (e) {
    console.warn("[finance] Не удалось сохранить исполнение бюджета в localStorage:", e);
  }
}

export async function persistFinanceBudgetExecutionSnapshot(
  projectId: string,
  snapshot: FinanceExecutionImport,
): Promise<void> {
  const payload: FinanceExecutionImport = {
    title: snapshot.title,
    reportingDate: snapshot.reportingDate,
    kpi: cloneFinanceExecutionKpi(snapshot.kpi),
    salesChart: snapshot.salesChart ?? null,
    expenseChart: snapshot.expenseChart ?? null,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    importMeta: snapshot.importMeta,
  };
  saveFinanceBudgetExecutionToLocalStorage(projectId, payload);
}

export type BootstrapFinanceBudgetExecutionResult = {
  snapshot: FinanceExecutionImport;
};

function emptyExecutionSnapshot(): FinanceExecutionImport {
  return emptyFinanceExecutionImport();
}

export async function loadPersistedFinanceBudgetExecution(
  projectId: string,
): Promise<BootstrapFinanceBudgetExecutionResult> {
  const ls = loadFinanceBudgetExecutionFromLocalStorage(projectId);
  if (ls && financeExecutionKpiHasData(ls.kpi)) {
    return {
      snapshot: {
        title: ls.title,
        reportingDate: ls.reportingDate,
        kpi: cloneFinanceExecutionKpi(ls.kpi),
        salesChart: ls.salesChart ?? null,
        expenseChart: ls.expenseChart ?? null,
        updatedAt: ls.updatedAt,
        importMeta: ls.importMeta,
      },
    };
  }

  return { snapshot: emptyExecutionSnapshot() };
}
