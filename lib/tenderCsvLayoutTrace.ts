/**
 * Диагностика выбора layout (procurement vs flat). Только console — логика не меняется.
 */

export type TenderCsvLayoutKind = "procurement" | "flat";

const LOG = "[tender-import][layout-trace]";

export type LayoutSelectionCondition = {
  condition: string;
  result: boolean;
  reason: string;
  actual?: unknown;
  expected?: unknown;
};

export type LayoutSelectionTrace = {
  conditions: LayoutSelectionCondition[];
  selectedLayout: TenderCsvLayoutKind;
  selectionReason: string;
  firstFlatCondition: string | null;
  parsePath: "procurement_matrix" | "flat_matrix" | "legacy_header" | "diagnose_only";
  matrixRowCount: number;
  row0Preview: string[];
  row1Preview: string[];
};

function cond(
  condition: string,
  result: boolean,
  reason: string,
  actual?: unknown,
  expected?: unknown,
): LayoutSelectionCondition {
  return { condition, result, reason, actual, expected };
}

export function logTenderCsvLayoutSelectionTrace(trace: LayoutSelectionTrace): void {
  if (typeof console === "undefined") return;

  console.info(`${LOG} matrixRowCount:`, trace.matrixRowCount);
  console.info(`${LOG} row0 (primary):`, trace.row0Preview);
  console.info(`${LOG} row1 (sub):`, trace.row1Preview);
  console.info(`${LOG} parsePath:`, trace.parsePath);

  for (const c of trace.conditions) {
    console.info(`${LOG} --------------------------------`);
    console.info(`${LOG} check:`, c.condition);
    console.info(`${LOG} result:`, c.result);
    console.info(`${LOG} why:`, c.reason);
    if (c.actual !== undefined) console.info(`${LOG} actual:`, c.actual);
    if (c.expected !== undefined) console.info(`${LOG} expected:`, c.expected);
  }

  console.info(`${LOG} --------------------------------`);
  console.table(
    trace.conditions.map((c) => ({
      condition: c.condition,
      result: c.result,
      reason: c.reason,
    })),
  );

  console.info(`${LOG} selectedLayout:`, trace.selectedLayout);
  console.info(`${LOG} selectionReason:`, trace.selectionReason);

  if (trace.firstFlatCondition) {
    console.warn(`${LOG} firstConditionChoosingFlat:`, trace.firstFlatCondition);
  }
}

/** Собрать условия из уже вычисленных сигналов (без изменения логики выбора). */
export function buildLayoutSelectionTrace(args: {
  matrixRowCount: number;
  row0: unknown[];
  row1: unknown[];
  row2: unknown[] | undefined;
  primary: {
    hasSerial: boolean;
    hasName: boolean;
    hasTenderSheet: boolean;
    gprArticles: boolean;
    structuralDataRow: boolean;
    passed: boolean;
  };
  subHeader: {
    planFact: number;
    otkl: number;
    structuralGroups: number;
    passed: boolean;
  };
  flatHeaderRowIndex: number | null;
  procurementPathAvailable: boolean;
  detectedLayout: TenderCsvLayoutKind;
  selectionReason: string;
  parsePath: LayoutSelectionTrace["parsePath"];
  procurementMatrixNullReason?: string | null;
  flatMatrixNullReason?: string | null;
}): LayoutSelectionTrace {
  const joined0 = args.row0.map((c) => String(c ?? "").trim().toLowerCase()).join(" ");
  const hasIdCode = joined0.includes("id код");
  const hasStageColumn =
    joined0.includes("этап работ") || joined0.includes("гпр") || joined0.includes("отставание");
  const hasTenderNumber = args.primary.hasSerial;
  const hasPlanFactGroups = args.subHeader.structuralGroups >= 2;
  const hasMergedHeaders =
    args.procurementPathAvailable ||
    (args.subHeader.passed && args.primary.passed);
  const procurementSignals =
    args.primary.gprArticles ||
    args.primary.structuralDataRow ||
    args.primary.hasTenderSheet ||
    args.subHeader.passed;
  const flatSignals = args.flatHeaderRowIndex != null && args.flatHeaderRowIndex >= 0;

  const conditions: LayoutSelectionCondition[] = [
    cond(
      "matrixRowCountAtLeast3",
      args.matrixRowCount >= 3,
      args.matrixRowCount >= 3 ? "достаточно строк для procurement-matrix" : "меньше 3 непустых строк",
      args.matrixRowCount,
      ">= 3",
    ),
    cond(
      "hasTenderNumber",
      hasTenderNumber,
      hasTenderNumber ? "колонка 0: № / п/п / статей" : "первая ячейка не похожа на № статей / п/п",
      String(args.row0[0] ?? ""),
      "№ / п/п / статей",
    ),
    cond(
      "hasIdCode",
      hasIdCode,
      hasIdCode ? "в шапке есть «id код»" : "нет подстроки id код в row0",
      joined0.slice(0, 120),
      "includes id код",
    ),
    cond(
      "hasStageColumn",
      hasStageColumn,
      hasStageColumn ? "есть этап работ / гпр / отставание" : "нет колонки этапа в row0",
      hasStageColumn,
      true,
    ),
    cond(
      "hasGprArticles",
      args.primary.gprArticles,
      args.primary.gprArticles
        ? "№ статей + ID Код + этап/ГПР"
        : "не выполнен состав GPR-статей",
      args.primary.gprArticles,
      true,
    ),
    cond(
      "structuralFallback",
      args.primary.structuralDataRow,
      args.primary.structuralDataRow
        ? "во 2-й строке данных (row2) колонка B — код N.N.N"
        : "нет GPR-кода в row2[1] или row0 короткая",
      args.row2 ? String(args.row2[1] ?? "") : "(нет row2)",
      "regex ^\\d+\\.\\d+",
    ),
    cond(
      "hasTenderSheet",
      args.primary.hasTenderSheet,
      args.primary.hasTenderSheet
        ? "есть начало тендера / договор / стоимость / тендер"
        : "нет блока тендера в row0",
      args.primary.hasTenderSheet,
      true,
    ),
    cond(
      "primaryHeaderName",
      args.primary.hasName,
      args.primary.hasName ? "есть наименование / этап работ / id код" : "нет name-признака",
      args.primary.hasName,
      true,
    ),
    cond(
      "primaryHeaderPassed",
      args.primary.passed,
      args.primary.passed
        ? "looksLikeTenderProcurementPrimaryHeader → true"
        : "primary header не прошёл (ни gprArticles, ни structural, ни serial+name+sheet)",
      args.primary.passed,
      true,
    ),
    cond(
      "subPlanFactCount",
      args.subHeader.planFact >= 2,
      `план/факт в row1: ${args.subHeader.planFact}`,
      args.subHeader.planFact,
      ">= 2",
    ),
    cond(
      "subPlanFactPlusOtkl",
      args.subHeader.planFact >= 1 && args.subHeader.otkl >= 1,
      `план/факт=${args.subHeader.planFact}, откл.=${args.subHeader.otkl}`,
      { planFact: args.subHeader.planFact, otkl: args.subHeader.otkl },
      "planFact>=1 && otkl>=1",
    ),
    cond(
      "hasPlanFactGroups",
      hasPlanFactGroups,
      `структурных групп по 3 колонки в row1: ${args.subHeader.structuralGroups}`,
      args.subHeader.structuralGroups,
      ">= 2",
    ),
    cond(
      "subHeaderPassed",
      args.subHeader.passed,
      args.subHeader.passed
        ? "looksLikeTenderProcurementSubHeader → true"
        : "row1 не распознана как План/Факт/Откл.",
      args.subHeader.passed,
      true,
    ),
    cond(
      "hasMergedHeaders",
      hasMergedHeaders,
      hasMergedHeaders
        ? "primary + sub прошли → двухуровневая шапка"
        : "нет пары primary+sub для merge",
      hasMergedHeaders,
      true,
    ),
    cond(
      "procurementPathAvailable",
      args.procurementPathAvailable,
      args.procurementPathAvailable
        ? "matrix>=3 && primary && sub → procurement"
        : "procurement-path недоступен",
      args.procurementPathAvailable,
      true,
    ),
    cond(
      "procurementMatrixAccepted",
      args.parsePath === "procurement_matrix",
      args.parsePath === "procurement_matrix"
        ? "parseTenderProcurementMatrix вернул результат"
        : args.procurementMatrixNullReason ?? "parseTenderProcurementMatrix → null",
      args.parsePath,
      "procurement_matrix",
    ),
    cond(
      "flatSignals",
      flatSignals,
      flatSignals
        ? `flat-matrix: строка ${(args.flatHeaderRowIndex ?? 0) + 1} похожа на заголовок`
        : "нет одноуровневой строки-заголовка",
      args.flatHeaderRowIndex,
      ">= 0",
    ),
    cond(
      "flatMatrixAccepted",
      args.parsePath === "flat_matrix" || args.parsePath === "legacy_header",
      args.parsePath !== "procurement_matrix"
        ? `выбран flat (${args.parsePath})`
        : "flat не использовался",
      args.parsePath,
      "flat_matrix | legacy_header",
    ),
    cond(
      "procurementSignals",
      procurementSignals,
      procurementSignals
        ? "файл содержит признаки procurement-шапки"
        : "слабые procurement-признаки",
      procurementSignals,
      true,
    ),
  ];

  let firstFlatCondition: string | null = null;
  if (args.detectedLayout === "flat") {
    const order = [
      "matrixRowCountAtLeast3",
      "primaryHeaderPassed",
      "subHeaderPassed",
      "procurementPathAvailable",
      "procurementMatrixAccepted",
    ];
    for (const key of order) {
      const row = conditions.find((c) => c.condition === key);
      if (row && !row.result) {
        firstFlatCondition = key;
        break;
      }
    }
    if (!firstFlatCondition && args.parsePath === "flat_matrix") {
      firstFlatCondition = "procurementMatrixAccepted";
    }
    if (!firstFlatCondition && args.parsePath === "legacy_header") {
      firstFlatCondition = "flatMatrixAccepted";
    }
  }

  return {
    conditions,
    selectedLayout: args.detectedLayout,
    selectionReason: args.selectionReason,
    firstFlatCondition,
    parsePath: args.parsePath,
    matrixRowCount: args.matrixRowCount,
    row0Preview: args.row0.map((c) => String(c ?? "").trim()).slice(0, 10),
    row1Preview: args.row1.map((c) => String(c ?? "").trim()).slice(0, 12),
  };
}
