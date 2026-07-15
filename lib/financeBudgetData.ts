/** Помесячные значения бюджета, ключ периода YYYY-MM. */
export type FinanceBudgetMonthlyValues = Record<string, number>;

/** Строка бюджета проекта (статья сметы / бюджета). */
export type FinanceBudgetLine = {
  id: string;
  /** Код бюджета (родительские статьи: «1.», «2.», …). */
  code: string;
  name: string;
  category?: string;
  unit?: string;
  /** Итого по строке, ₽ (если задано в CSV). */
  totalPlanRub?: number;
  monthlyPlanRub: FinanceBudgetMonthlyValues;
  monthlyFactRub?: FinanceBudgetMonthlyValues;
  comment?: string;
};

export type FinanceBudgetImportMeta = {
  sourceFileName?: string;
  headerRowIndex?: number;
  periodKeys?: string[];
  factPeriodKeys?: string[];
  lastImportAt?: string;
  /** Версия бюджета из CSV или имени файла. */
  budgetVersion?: string;
};

export type FinanceBudgetSnapshot = {
  lines: FinanceBudgetLine[];
  updatedAt?: string;
  importMeta?: FinanceBudgetImportMeta;
};

/** Импорт CSV «Бюджет проекта» — график, статьи бюджета. */
export type FinanceBudgetImport = FinanceBudgetSnapshot;

/** Код родительской статьи «Поступления по основным видам деятельности». */
export const FINANCE_OPERATING_RECEIPTS_BUDGET_CODE = "1.";

/** Код родительской статьи «Платежи по основным видам деятельности». */
export const FINANCE_OPERATING_PAYMENTS_BUDGET_CODE = "2.";

/**
 * Нормализация кода бюджета для точного сравнения.
 * trim(), удаление пробелов, завершающая точка сохраняется.
 * «2.», « 2. », «2. » → «2.»
 */
export function normalizeFinanceBudgetCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "");
}

export function financeBudgetCodesMatch(codeA: unknown, codeB: unknown): boolean {
  const a = normalizeFinanceBudgetCode(codeA);
  const b = normalizeFinanceBudgetCode(codeB);
  return a !== "" && b !== "" && a === b;
}

function compareFinanceBudgetCodes(a: string, b: string): number {
  return normalizeFinanceBudgetCode(a).localeCompare(normalizeFinanceBudgetCode(b), "ru", {
    numeric: true,
  });
}

/** Диагностика кодов после импорта CSV. */
export function logFinanceBudgetImportCodeDiagnostics(
  lines: FinanceBudgetLine[],
  _options?: { planMonthColumnCount?: number },
): void {
  const allCodes = lines
    .map((line) => line.code.trim())
    .filter(Boolean)
    .sort(compareFinanceBudgetCodes);

  console.log("[finance-budget-csv] Все коды бюджета после импорта:", allCodes);

  const operating = findFinanceBudgetLineByCode(lines, FINANCE_OPERATING_PAYMENTS_BUDGET_CODE);
  const receipts = findFinanceBudgetLineByCode(lines, FINANCE_OPERATING_RECEIPTS_BUDGET_CODE);
  if (!receipts) {
    console.warn(
      "[finance-budget-csv] Статья с кодом 1. не найдена. Все коды бюджета:",
      allCodes,
    );
  } else {
    console.log("[finance-budget-csv] Статья код 1. найдена:", {
      исходныйКод: receipts.code,
      нормализованныйКод: normalizeFinanceBudgetCode(receipts.code),
      название: receipts.name,
      версияНа: receipts.totalPlanRub ?? null,
    });
  }
  if (!operating) {
    console.warn(
      "[finance-budget-csv] Статья с кодом 2. не найдена. Все коды бюджета:",
      allCodes,
    );
    return;
  }

  console.log("[finance-budget-csv] Статья код 2. найдена:", {
    исходныйКод: operating.code,
    нормализованныйКод: normalizeFinanceBudgetCode(operating.code),
    название: operating.name,
  });
}

function stableBudgetLineId(code: string, name: string, rowIndex: number): string {
  const base = `${code.trim()}|${name.trim()}`.toLowerCase();
  const slug = base.replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-").replace(/^-+|-+$/g, "");
  return slug ? `budget-${slug}` : `budget-row-${rowIndex}`;
}

export function normalizeFinanceBudgetRowLoose(raw: unknown): FinanceBudgetLine | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const code = String(row.code ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!code && !name) return null;

  const monthlyPlanRub: FinanceBudgetMonthlyValues = {};
  const planSrc = row.monthlyPlanRub;
  if (planSrc && typeof planSrc === "object") {
    for (const [k, v] of Object.entries(planSrc as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) monthlyPlanRub[k] = n;
    }
  }

  const monthlyFactRub: FinanceBudgetMonthlyValues = {};
  const factSrc = row.monthlyFactRub;
  if (factSrc && typeof factSrc === "object") {
    for (const [k, v] of Object.entries(factSrc as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) monthlyFactRub[k] = n;
    }
  }

  const totalPlanRaw = row.totalPlanRub;
  const totalPlanRub =
    totalPlanRaw != null && Number.isFinite(Number(totalPlanRaw)) ? Number(totalPlanRaw) : undefined;

  const id = String(row.id ?? "").trim() || stableBudgetLineId(code, name, 0);

  return {
    id,
    code: code || name,
    name: name || code,
    category: row.category != null ? String(row.category).trim() || undefined : undefined,
    unit: row.unit != null ? String(row.unit).trim() || undefined : undefined,
    totalPlanRub,
    monthlyPlanRub,
    monthlyFactRub: Object.keys(monthlyFactRub).length > 0 ? monthlyFactRub : undefined,
    comment: row.comment != null ? String(row.comment).trim() || undefined : undefined,
  };
}

export function cloneFinanceBudgetLines(lines: FinanceBudgetLine[]): FinanceBudgetLine[] {
  return lines.map((line) => ({
    ...line,
    monthlyPlanRub: { ...line.monthlyPlanRub },
    monthlyFactRub: line.monthlyFactRub ? { ...line.monthlyFactRub } : undefined,
  }));
}

/** Точное совпадение нормализованного кода (без startsWith и без агрегации дочерних статей). */
export function findFinanceBudgetLineByCode(
  lines: FinanceBudgetLine[],
  targetCode: string,
): FinanceBudgetLine | null {
  const normalizedTarget = normalizeFinanceBudgetCode(targetCode);
  if (!normalizedTarget) return null;
  return lines.find((line) => financeBudgetCodesMatch(line.code, normalizedTarget)) ?? null;
}

export function findAllFinanceBudgetLinesByCode(
  lines: FinanceBudgetLine[],
  targetCode: string,
): FinanceBudgetLine[] {
  const normalizedTarget = normalizeFinanceBudgetCode(targetCode);
  if (!normalizedTarget) return [];
  return lines.filter((line) => financeBudgetCodesMatch(line.code, normalizedTarget));
}

export function financeBudgetLinePlanTotalRub(line: FinanceBudgetLine): number {
  if (line.totalPlanRub != null && Number.isFinite(line.totalPlanRub) && line.totalPlanRub > 0) {
    return line.totalPlanRub;
  }
  return Object.values(line.monthlyPlanRub).reduce((sum, value) => sum + value, 0);
}

export function financeBudgetLineFactTotalRub(line: FinanceBudgetLine): number | null {
  if (!line.monthlyFactRub || Object.keys(line.monthlyFactRub).length === 0) return null;
  return Object.values(line.monthlyFactRub).reduce((sum, value) => sum + value, 0);
}
