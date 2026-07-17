import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  fetchFinanceBudgetFromDb,
  fetchFinanceExecutionFromDb,
  putFinanceBudgetToDb,
  putFinanceExecutionToDb,
} from "@/lib/financeApi";
import {
  cloneFinanceExecutionKpi,
  emptyFinanceExecutionImport,
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

/** Ключ localStorage для снимка financeBudgetImport (кэш). */
export function financeBudgetImportStorageKey(projectId: string): string {
  return `financeBudgetImport_${projectId}`;
}

/** Ключ localStorage для снимка «Исполнение бюджета» (кэш). */
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
  options?: { emitEvent?: boolean },
): void {
  if (typeof window === "undefined") return;
  try {
    const key = financeBudgetImportStorageKey(projectId);
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    // Не эмитить при кэше после чтения из БД — иначе reload ↔ event зациклится.
    if (options?.emitEvent !== false) {
      window.dispatchEvent(new CustomEvent(FINANCE_BUDGET_SAVED_EVENT));
    }
  } catch (e) {
    console.warn("[finance] Не удалось сохранить бюджет в localStorage:", e);
  }
}

export type FinanceBudgetImportApiPayload = {
  lines: FinanceBudgetLine[];
  updatedAt?: string;
  importMeta?: FinanceBudgetImportMeta;
};

/** Файловый Next API — запасной общий store (не Postgres). */
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

function cloneBudgetSnapshot(src: FinanceBudgetSnapshot): FinanceBudgetSnapshot {
  return {
    lines: cloneFinanceBudgetLines(src.lines),
    updatedAt: src.updatedAt,
    importMeta: src.importMeta,
  };
}

/**
 * Цепочка при старте: PostgreSQL — единственный источник истины.
 * localStorage — только кэш после успешного чтения из БД.
 * Одноразовая миграция: если БД пуста, а в LS есть данные — заливаем в БД.
 */
export async function loadPersistedFinanceBudget(
  projectId: string,
): Promise<BootstrapFinanceBudgetResult> {
  const fromDb = await fetchFinanceBudgetFromDb(projectId);
  if (fromDb && fromDb.lines.length > 0) {
    const snapshot = cloneBudgetSnapshot(fromDb);
    saveFinanceBudgetToLocalStorage(projectId, snapshot, { emitEvent: false });
    return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
  }

  const ls = loadFinanceBudgetFromLocalStorage(projectId);
  if (ls && ls.lines.length > 0) {
    const snapshot = cloneBudgetSnapshot(ls);
    const migrated = await putFinanceBudgetToDb(projectId, snapshot);
    if (migrated) {
      return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
    }
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
  const dbOk = await putFinanceBudgetToDb(projectId, payload);
  if (!dbOk) {
    throw new Error(
      "Не удалось сохранить бюджет в PostgreSQL. Проверьте авторизацию и доступность API.",
    );
  }
  saveFinanceBudgetToLocalStorage(projectId, payload);
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
  const detailRaw = Array.isArray(body.detailSegments) ? body.detailSegments : [];
  const detailSegments = detailRaw
    .map((segment) => parseChartSegment(segment))
    .filter((segment): segment is FinanceExecutionChartSegment => segment != null);
  if (segments.length === 0 && typeof body.projectTotalCostRub !== "number") return null;
  return {
    segments,
    detailSegments: detailSegments.length > 0 ? detailSegments : undefined,
    contractedTotalRub:
      typeof body.contractedTotalRub === "number" ? body.contractedTotalRub : null,
    projectTotalCostRub:
      typeof body.projectTotalCostRub === "number" ? body.projectTotalCostRub : null,
  };
}

function parseStoredExecutionSnapshot(raw: unknown): FinanceExecutionImport | null {
  try {
    const data =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
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

function cloneExecutionSnapshot(src: FinanceExecutionImport): FinanceExecutionImport {
  return {
    title: src.title,
    reportingDate: src.reportingDate,
    kpi: cloneFinanceExecutionKpi(src.kpi),
    salesChart: src.salesChart ?? null,
    expenseChart: src.expenseChart ?? null,
    updatedAt: src.updatedAt,
    importMeta: src.importMeta,
  };
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
  options?: { emitEvent?: boolean },
): void {
  if (typeof window === "undefined") return;
  try {
    const key = financeBudgetExecutionImportStorageKey(projectId);
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    // Не эмитить при кэше после чтения из БД — иначе reload ↔ event зациклится.
    if (options?.emitEvent !== false) {
      window.dispatchEvent(new CustomEvent(FINANCE_BUDGET_EXECUTION_SAVED_EVENT));
    }
  } catch (e) {
    console.warn("[finance] Не удалось сохранить исполнение бюджета в localStorage:", e);
  }
}

export async function fetchFinanceBudgetExecutionFromApi(
  projectId: string,
): Promise<FinanceExecutionImport | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/finance/execution/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return parseStoredExecutionSnapshot(body);
  } catch {
    return null;
  }
}

export async function postFinanceBudgetExecutionToApi(
  projectId: string,
  snapshot: FinanceExecutionImport,
): Promise<boolean> {
  try {
    const res = await fetch("/api/finance/execution/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        ...snapshot,
        updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function persistFinanceBudgetExecutionSnapshot(
  projectId: string,
  snapshot: FinanceExecutionImport,
): Promise<void> {
  const payload = cloneExecutionSnapshot({
    ...snapshot,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
  });
  const dbOk = await putFinanceExecutionToDb(projectId, payload);
  if (!dbOk) {
    throw new Error(
      "Не удалось сохранить исполнение бюджета в PostgreSQL. Проверьте авторизацию и доступность API.",
    );
  }
  saveFinanceBudgetExecutionToLocalStorage(projectId, payload);
}

export type BootstrapFinanceBudgetExecutionResult = {
  snapshot: FinanceExecutionImport;
};

function emptyExecutionSnapshot(): FinanceExecutionImport {
  return emptyFinanceExecutionImport();
}

/**
 * PostgreSQL — единственный источник истины.
 * localStorage — кэш; одноразовая миграция LS → DB, если БД пуста.
 */
export async function loadPersistedFinanceBudgetExecution(
  projectId: string,
): Promise<BootstrapFinanceBudgetExecutionResult> {
  const fromDb = await fetchFinanceExecutionFromDb(projectId);
  const dbParsed = fromDb ? parseStoredExecutionSnapshot(fromDb) : null;
  if (dbParsed && financeExecutionKpiHasData(dbParsed.kpi)) {
    const snapshot = cloneExecutionSnapshot(dbParsed);
    saveFinanceBudgetExecutionToLocalStorage(projectId, snapshot, { emitEvent: false });
    return { snapshot };
  }

  const ls = loadFinanceBudgetExecutionFromLocalStorage(projectId);
  if (ls && financeExecutionKpiHasData(ls.kpi)) {
    const snapshot = cloneExecutionSnapshot(ls);
    const migrated = await putFinanceExecutionToDb(projectId, snapshot);
    if (migrated) {
      return { snapshot };
    }
  }

  return { snapshot: emptyExecutionSnapshot() };
}
