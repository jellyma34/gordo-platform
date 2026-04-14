import {
  analyzeUpsellDiagnostic,
  buildSalesPlanMonthlyDealExecution,
  type ExplainFormulaDetailCard,
  type SalesPlanMonthlyDealRow,
  SALES_TEMPO_EXPLAIN_INTRO_WORK,
  type SalesPlanExplainInteractivePoint,
  type SalesPlanPresentationExplainBlock,
} from "@/lib/buildSalesPlanPresentationExplain";
import { marketingSalesReportMock } from "@/lib/marketingSalesReportData";
import { SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS } from "@/lib/salesPlanPresentationExplainConfig";
import type { SalesPlanExplainSessionPayload } from "@/lib/salesPlanExplainSession";
import { salesPlanPeriodKeyThisMonth } from "@/lib/salesPlanVelocityChartData";
import {
  SALES_PLAN_CATEGORY_IDS,
  SALES_PLAN_CATEGORY_LABELS,
  SALES_PLAN_METRIC_LABELS,
  SALES_PLAN_SCENARIO_LABELS,
  deriveSalesPlanRow,
} from "@/lib/salesPlanWorkModel";

const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rubFmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

function compactRub(n: number): string {
  return rubFmt.format(Math.round(n));
}

const APT_IDS = ["1k", "2k", "3k", "4k_plus"] as const;

function buildWorkModeSalesTempoFormulaDetailCards(
  payload: SalesPlanExplainSessionPayload,
  scenarioLabel: string,
  monthlyDealRows: SalesPlanMonthlyDealRow[],
): { formulaDetailCards: ExplainFormulaDetailCard[]; formulaSectionFooter: string } {
  const { scenario, savedAt, metricTab } = payload;
  const sliceNote = `Сценарий рабочей таблицы: ${scenarioLabel} (${scenario}). Снимок: ${savedAt}. Вкладка метрик при переходе: ${SALES_PLAN_METRIC_LABELS[metricTab]}. График темпа — те же помесячные точки, что в презентации (marketingMockData.salesPlan.month / salesFact.month, фильтр all/all).`;
  const monthKey = salesPlanPeriodKeyThisMonth();
  const currentMonthIdx = (() => {
    const idx = monthlyDealRows.findIndex((r) => r.periodKey === monthKey);
    return idx >= 0 ? idx : Math.max(0, monthlyDealRows.length - 1);
  })();
  const totalMonths = Math.max(1, monthlyDealRows.length);
  const monthsPassed = Math.max(1, Math.min(totalMonths, currentMonthIdx + 1));
  const sumPlanMonthU = monthlyDealRows.reduce((s, r) => s + r.plan, 0);
  const sumFactMonthU = monthlyDealRows.reduce((s, r) => s + r.fact, 0);
  const currentFact = monthlyDealRows.slice(0, monthsPassed).reduce((s, r) => s + r.fact, 0);
  const monthFact = monthlyDealRows[Math.max(0, monthsPassed - 1)]?.fact ?? 0;
  const planReportMonth = monthlyDealRows[currentMonthIdx]?.plan ?? 0;
  const monthDeviation = monthFact - planReportMonth;
  const n = totalMonths;
  const planPerMonth = sumPlanMonthU / n;
  const actualPerMonth = currentFact / monthsPassed;
  const velocityCompletionPct = planPerMonth > 0 ? Math.round((actualPerMonth / planPerMonth) * 100) : 0;
  const monthDevU = sumFactMonthU - sumPlanMonthU;
  const monthRatioU = sumPlanMonthU > 0 ? ((sumFactMonthU / sumPlanMonthU) * 100).toFixed(1) : "—";

  const formulaDetailCards: ExplainFormulaDetailCard[] = [
    {
      name: "Суммы плана и факта по горизонту (штуки)",
      metricId: "sumPlanFact",
      formula:
        "Σ plan_month = сумма planDeals по всем месяцам ряда (salesPlan.month после merge); Σ fact_month = сумма factDeals (salesFact.month) — как столбцы «Факт vs план» на слайде.",
      variables: [
        { symbol: "Σ plan_month", label: "план, шт.", value: numFmt.format(sumPlanMonthU) },
        { symbol: "Σ fact_month", label: "факт, шт.", value: numFmt.format(sumFactMonthU) },
        { symbol: "Δ", label: "факт − план", value: `${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))}` },
      ],
      calculation: `Σ plan_month = ${numFmt.format(sumPlanMonthU)}, Σ fact_month = ${numFmt.format(sumFactMonthU)} → Δ ${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))} шт. ${sliceNote}`,
      whyThisFormula:
        "Это тот же суммарный горизонт, что подставляется в масштаб графика презентации, а не сумма по категориям рабочей сетки.",
      interpretation:
        monthDevU >= 0
          ? "За весь ряд факт не ниже суммарного плана по штукам — базовый объёмный сигнал неотрицательный."
          : "За весь ряд факт ниже суммарного плана — смотрите месяцы со столбцами ниже плана.",
    },
    {
      name: "Ровная норма (план на месяц)",
      metricId: "planPerMonth",
      formula: "planPerMonth = Σ plan_month / N, где N — число месяцев в ряду (ось X графика).",
      variables: [
        { symbol: "Σ plan_month", label: "сумма плана", value: numFmt.format(sumPlanMonthU) },
        { symbol: "N", label: "месяцев в ряду", value: String(n) },
        { symbol: "planPerMonth", label: "норма, сделок/мес.", value: dec1.format(planPerMonth) },
      ],
      calculation: `planPerMonth = ${numFmt.format(sumPlanMonthU)} / ${n} = ${dec1.format(planPerMonth)} сделок/мес. ${sliceNote}`,
      whyThisFormula:
        "Пунктир на графике «Темп по месяцам» — ровная месячная норма из годового распределения плана (как в SalesPlanPanel).",
      interpretation:
        "Каждый столбец справа сравнивается со своим месячным plan_month; линия темпа — со скользящим средним фактом к этой норме.",
    },
    {
      name: "Скользящий средний факт",
      metricId: "actualPerMonth",
      formula:
        "actualPerMonth = (факт с 1-го по текущий отчётный месяц) / число прошедших месяцев; отчётный месяц — по календарю (periodKey «сегодня» в ряду).",
      variables: [
        { symbol: "накопл. факт", label: "за прошедшие мес.", value: numFmt.format(currentFact) },
        { symbol: "прошло мес.", label: "k", value: String(monthsPassed) },
        { symbol: "actualPerMonth", label: "средний факт", value: dec1.format(actualPerMonth) },
      ],
      calculation: `${numFmt.format(currentFact)} / ${monthsPassed} = ${dec1.format(actualPerMonth)} сделок/мес. ${sliceNote}`,
      whyThisFormula:
        "Цветная линия — накопленный средний факт по мере движения по месяцам; совпадает с логикой презентации и дашборд-explain.",
      interpretation:
        actualPerMonth >= planPerMonth * 0.995
          ? "Средний факт у нормы или выше — линия у пунктира или выше."
          : "Средний факт ниже нормы — без ускорения закрытий годовой план по сделкам под угрозой.",
    },
    {
      name: "Темп к норме",
      metricId: "tempoNorm",
      formula: "tempo = actualPerMonth / planPerMonth × 100% (округление до целого в индикаторе).",
      variables: [
        { symbol: "actualPerMonth", label: "средний факт", value: dec1.format(actualPerMonth) },
        { symbol: "planPerMonth", label: "норма", value: dec1.format(planPerMonth) },
        { symbol: "% к норме", label: "темп", value: `${velocityCompletionPct}%` },
      ],
      calculation: `${dec1.format(actualPerMonth)} / ${dec1.format(planPerMonth)} × 100% = ${velocityCompletionPct}%. ${sliceNote}`,
      whyThisFormula:
        "Один процент отвечает на вопрос: «в среднем дотягиваем ли до плановой планки на месяц».",
      interpretation:
        velocityCompletionPct >= 100
          ? "Не ниже 100% к норме — средний темп не проигрывает ровному плану."
          : `Ниже 100% — средний темп отстаёт; усильте закрытие на слабых месяцах справа.`,
    },
    {
      name: "Помесячное сравнение (столбцы)",
      metricId: "monthlyCompare",
      formula:
        "На каждом месяце: fact_month и plan_month в штуках; отклонение месяца Δ = fact_month − plan_month. Совокупно по ряду: Σ fact_month − Σ plan_month.",
      variables: [
        { symbol: "месяц", label: "отчётная метка", value: `${monthlyDealRows[currentMonthIdx]?.label ?? "—"} (${monthlyDealRows[currentMonthIdx]?.periodKey ?? "—"})` },
        { symbol: "fact_month", label: "факт", value: numFmt.format(monthFact) },
        { symbol: "plan_month", label: "план", value: numFmt.format(planReportMonth) },
        { symbol: "Δ_month", label: "факт − план", value: `${monthDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviation))}` },
      ],
      calculation: `Отчётный месяц: факт ${numFmt.format(monthFact)}, план ${numFmt.format(planReportMonth)} → Δ = ${monthDeviation >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDeviation))} сделок. За весь ряд: ${numFmt.format(sumFactMonthU)} − ${numFmt.format(sumPlanMonthU)} = ${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))}. ${sliceNote}`,
      whyThisFormula:
        "Столбцы привязаны к календарным месяцам оси X, а не к строкам категорий рабочей таблицы.",
      interpretation:
        monthDeviation >= 0
          ? "В выбранном отчётном месяце факт не ниже плана по сделкам."
          : "В отчётном месяце факт ниже плана — усильте закрытие в этом и соседних периодах.",
    },
    {
      name: "Доля факта к плану (за весь ряд)",
      metricId: "monthlyRatio",
      formula: "Σ fact_month / Σ plan_month × 100% при Σ plan_month > 0; по одному месяцу: fact_month / plan_month × 100%.",
      variables: [
        {
          symbol: "Σ fact / Σ plan",
          label: "штуки",
          value: `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)}`,
        },
        { symbol: "%", label: "факт к плану (ряд)", value: `${monthRatioU}%` },
      ],
      calculation:
        sumPlanMonthU > 0
          ? `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)} × 100% = ${monthRatioU}%. ${sliceNote}`
          : `План в штуках = 0 — долю не считаем. ${sliceNote}`,
      whyThisFormula:
        "Отношение сумм по всем месяцам совпадает с показателем «объёмы столбцов» на горизонте слайда.",
      interpretation:
        sumPlanMonthU <= 0
          ? "Нулевой суммарный план — ориентируйтесь на абсолютный факт по месяцам."
          : Number(monthRatioU) >= 100
            ? "Не ниже 100% — суммарный факт не проигрывает суммарному плану за ряд."
            : `Меньше 100% — суммарный недобор по ряду; усиливайте слабые месяцы.`,
    },
  ];

  const formulaSectionFooter =
    Number(monthRatioU) >= 100
      ? "Итог: по помесячному ряду суммарный факт не ниже суммарного плана — контролируйте отдельные месяцы, чтобы не потерять запас."
      : `Итог: ряд ${monthRatioU}% (Σ факт / Σ план) — усильте закрытие в месяцах с наибольшим отставанием столбцов.`;

  return { formulaDetailCards, formulaSectionFooter };
}

export function buildSalesPlanWorkModeExplainBlocks(payload: SalesPlanExplainSessionPayload): SalesPlanPresentationExplainBlock[] {
  const cfg = SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS;
  const { scenario, grid, metricTab, savedAt } = payload;
  const slice = grid[scenario];
  const scenarioLabel = SALES_PLAN_SCENARIO_LABELS[scenario];

  let sumPlanCumU = 0;
  let sumFactCumU = 0;
  let sumPlanMonthR = 0;
  let sumFactMonthR = 0;
  let sumPlanCumR = 0;
  let sumFactCumR = 0;

  for (const id of SALES_PLAN_CATEGORY_IDS) {
    const u = slice.units[id];
    const r = slice.revenue[id];
    const du = deriveSalesPlanRow(u);
    const dr = deriveSalesPlanRow(r);
    sumPlanCumU += u.planCumulative;
    sumFactCumU += du.factCumulative;
    sumPlanMonthR += r.planMonth;
    sumFactMonthR += r.factMonth;
    sumPlanCumR += r.planCumulative;
    sumFactCumR += dr.factCumulative;
  }

  /** Тот же помесячный ряд, что «Темп по месяцам» в презентации (mock month[], фильтр all/all). */
  const monthlyDealRows = buildSalesPlanMonthlyDealExecution("all", "all");
  const tempoWorkPoints: SalesPlanExplainInteractivePoint[] = monthlyDealRows.map((r) => ({
    pointId: r.periodKey,
    label: r.label,
    plan: r.plan,
    fact: r.fact,
    detailLine: `${r.label} (${r.periodKey}): plan ${numFmt.format(r.plan)}, fact ${numFmt.format(r.fact)}, Δ ${numFmt.format(r.deviation)}`,
  }));

  const monthKey = salesPlanPeriodKeyThisMonth();
  const tempoCurrentMonthIdx = (() => {
    const idx = monthlyDealRows.findIndex((r) => r.periodKey === monthKey);
    return idx >= 0 ? idx : Math.max(0, monthlyDealRows.length - 1);
  })();
  const tempoTotalMonths = Math.max(1, monthlyDealRows.length);
  const tempoMonthsPassed = Math.max(1, Math.min(tempoTotalMonths, tempoCurrentMonthIdx + 1));
  const sumPlan = monthlyDealRows.reduce((s, r) => s + r.plan, 0);
  const sumFact = monthlyDealRows.reduce((s, r) => s + r.fact, 0);
  const currentFact = monthlyDealRows.slice(0, tempoMonthsPassed).reduce((s, r) => s + r.fact, 0);
  const monthFact = monthlyDealRows[Math.max(0, tempoMonthsPassed - 1)]?.fact ?? 0;
  const planPerMonth = sumPlan / tempoTotalMonths;
  const actualPerMonth = currentFact / tempoMonthsPassed;
  const velocityCompletionPct = planPerMonth > 0 ? Math.round((actualPerMonth / planPerMonth) * 100) : 0;
  const monthRatioU = sumPlan > 0 ? ((sumFact / sumPlan) * 100).toFixed(1) : "—";

  const workTempoFormulas = buildWorkModeSalesTempoFormulaDetailCards(payload, scenarioLabel, monthlyDealRows);

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: [
      "marketingMockData.salesPlan.month[] — planDeals по месяцам; marketingMockData.salesFact.month[] — factDeals; merge через mergeSalesPlanFact и filter all/all (как слайд «Темп продаж» в презентации).",
      `Рабочий снимок (сценарий ${scenarioLabel}) влияет на блоки «Структура» и «Upsell» ниже, но не подменяет помесячный ряд темпа.`,
    ],
    introDescription: SALES_TEMPO_EXPLAIN_INTRO_WORK,
    formulaLines: [],
    formulaDetailCards: workTempoFormulas.formulaDetailCards,
    formulaSectionFooter: workTempoFormulas.formulaSectionFooter,
    interactive: { valueKind: "deals", points: tempoWorkPoints },
    calculationLines: [
      `Сценарий таблицы: ${scenarioLabel} (${scenario}). Метрика при переходе: ${SALES_PLAN_METRIC_LABELS[metricTab]}. Снимок: ${savedAt}.`,
      `Горизонт темпа: ${tempoTotalMonths} мес.; в расчёте учтено ${tempoMonthsPassed} прошедших месяц(ев) (отчётный periodKey: ${monthlyDealRows[tempoCurrentMonthIdx]?.periodKey ?? "—"}).`,
      `Σ plan по ряду: ${numFmt.format(sumPlan)}; Σ fact: ${numFmt.format(sumFact)}; соотношение ${monthRatioU}%.`,
      `Ровная норма: ${dec1.format(planPerMonth)} сделок/мес.; скользящий средний факт: ${dec1.format(actualPerMonth)} сделок/мес.; к норме: ${velocityCompletionPct}%.`,
      `Отчётный месяц в ряду: факт ${numFmt.format(monthFact)}, план ${numFmt.format(monthlyDealRows[tempoCurrentMonthIdx]?.plan ?? 0)}.`,
    ],
    howSection:
      "График «Темп по месяцам» и столбцы «Факт vs план» строятся из того же помесячного merge salesPlan.month + salesFact.month, что и в режиме презентации (ось X — календарные месяцы). Тексты формул и индикатор темпа считаются так же, как на дашборде explain.",
    whySection:
      velocityCompletionPct >= 100
        ? `Скользящий темп держит норму (${velocityCompletionPct}%): накопленный факт за ${tempoMonthsPassed} мес. не отстаёт от ровной месячной планки.`
        : velocityCompletionPct >= 92
          ? `Темп близок к норме (${velocityCompletionPct}%): недобор умеренный; слабые месяцы видны на столбцах.`
          : `Темп ниже нормы (${velocityCompletionPct}%): при среднем ${dec1.format(actualPerMonth)} сделок/мес. до ровной нормы ${dec1.format(planPerMonth)} не дотягиваете — без ускорения закрытий план по сделкам под угрозой.`,
  };

  const planAvgDeal = sumPlanCumR / Math.max(1, sumPlanCumU);
  const factAvgDeal = sumFactCumR / Math.max(1, sumFactCumU);

  const structLines: string[] = [
    `Средний чек (план): ${compactRub(planAvgDeal)} = сумма выручки план нак. / сумма шт. план нак.`,
    `Средний чек (факт): ${compactRub(factAvgDeal)} = сумма выручки факт нак. / сумма шт. факт нак.`,
  ];

  const structureRows = SALES_PLAN_CATEGORY_IDS.map((id) => {
    const r = slice.revenue[id];
    const u = slice.units[id];
    const dr = deriveSalesPlanRow(r);
    const du = deriveSalesPlanRow(u);
    const deltaRub = dr.factCumulative - r.planCumulative;
    const pct = r.planCumulative > 0 ? (dr.factCumulative / r.planCumulative) * 100 : 0;
    return {
      id,
      label: SALES_PLAN_CATEGORY_LABELS[id],
      deltaRub,
      pct,
      planRub: r.planCumulative,
      factRub: dr.factCumulative,
      pu: u.planCumulative,
      fu: du.factCumulative,
    };
  });

  const structureWorkPoints: SalesPlanExplainInteractivePoint[] = structureRows.map((row) => ({
    pointId: `work-struct:${row.id}`,
    label: row.label,
    plan: row.planRub,
    fact: row.factRub,
    detailLine: `${row.label}: план ${compactRub(row.planRub)} → факт ${compactRub(row.factRub)} (Δ ${row.deltaRub >= 0 ? "+" : "−"}${compactRub(Math.abs(row.deltaRub))}), ${row.pct.toFixed(1)}% · шт. ${numFmt.format(row.pu)} → ${numFmt.format(row.fu)}`,
  }));

  const worst = [...structureRows].sort((a, b) => a.deltaRub - b.deltaRub)[0];
  const best = [...structureRows].sort((a, b) => b.deltaRub - a.deltaRub)[0];

  const structure: SalesPlanPresentationExplainBlock = {
    id: "structure",
    title: "Структура продаж",
    dataSources: [
      `grid[${scenario}].revenue[*]: planCumulative, planMonth, factMonth → факт накопительно по выручке.`,
      `grid[${scenario}].units[*]: те же периоды в штуках для сопоставления микса.`,
    ],
    formulaLines: cfg.structure.formulas,
    interactive: { valueKind: "rub", points: structureWorkPoints },
    calculationLines: structLines,
    howSection:
      "Каждая строка рабочей таблицы — отдельная линейка (1к … коммерция). Отклонение по деньгам: факт накопительно минус план накопительно по выручке; штуки показывают объём сделок по линейке.",
    whySection:
      worst.deltaRub < 0
        ? `Наибольший недобор: «${worst.label}». ${best.deltaRub > 0 ? `Перекрытие по «${best.label}» (+${compactRub(best.deltaRub)}).` : ""}`
        : "По всем линейкам в этом срезе нет отрицательного Δ по выручке — структура не тянет общий минус.",
  };

  const aptP = Math.max(1, Math.round(APT_IDS.reduce((s, id) => s + slice.units[id].planCumulative, 0)));
  const aptF = Math.max(
    1,
    Math.round(APT_IDS.reduce((s, id) => s + deriveSalesPlanRow(slice.units[id]).factCumulative, 0)),
  );

  const upModel = {
    ...marketingSalesReportMock.upsellDiagnostic,
    apartmentDealsPlan: aptP,
    apartmentDealsFact: aptF,
  };
  const up = analyzeUpsellDiagnostic(upModel);
  const upsellWorkPoints: SalesPlanExplainInteractivePoint[] = up.rows.map((r, i) => {
    const w = up.totalPlan > 0 ? r.planRevenueRub / up.totalPlan : 0;
    const detailLine = `${r.name}: план ${compactRub(r.planRevenueRub)}, факт ${compactRub(r.actualRevenueRub)}, Δ ${r.revDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(r.revDelta))}; вес w${i + 1} = ${compactRub(r.planRevenueRub)} / ${compactRub(up.totalPlan)} = ${(w * 100).toFixed(1)}%`;
    return {
      pointId: `upsell-${r.id}`,
      label: r.name,
      plan: r.planRevenueRub,
      fact: r.actualRevenueRub,
      detailLine,
    };
  });

  const upsell: SalesPlanPresentationExplainBlock = {
    id: "upsell",
    title: "Конверсия · монетизация (upsell)",
    dataSources: [
      `База квартир из рабочего режима: Σ шт. (1к+2к+3к+4к+) план нак. = ${numFmt.format(aptP)}, факт нак. = ${numFmt.format(aptF)}.`,
      "Планы/факты выручки и конверсии по паркингу и кладовым — из отчёта marketingSalesReportMock.upsellDiagnostic (как в презентации), с пересчётом весов от вашей базы квартир.",
    ],
    formulaLines: cfg.upsell.formulas,
    interactive: { valueKind: "rub", points: upsellWorkPoints },
    calculationLines: [
      `База квартир (рабочая таблица, сценарий ${scenarioLabel}): план ${numFmt.format(aptP)} шт., факт ${numFmt.format(aptF)} шт. → ${up.aptExecPct.toFixed(1)}%.`,
      `Сумма плановой выручки upsell (mock): ${compactRub(up.totalPlan)}; факт: ${compactRub(up.totalActual)}; Δ = ${up.totalRevDelta >= 0 ? "+" : "−"}${compactRub(Math.abs(up.totalRevDelta))}.`,
      `Сводная конверсия (план): ${dec1.format(up.totalConvPlan)}%; факт: ${dec1.format(up.totalConvFact)}%; Δ ${up.totalConvDeltaPP >= 0 ? "+" : ""}${dec1.format(up.totalConvDeltaPP)} п.п.`,
      `Масштаб плана под фактическую базу: ${compactRub(up.scaledPlanTotal)}.`,
      `Недобор базы (к полному плану upsell): ${compactRub(up.volumePenaltyRub)}; недобор конверсии: ${compactRub(up.convPenaltyRub)}.`,
    ],
    howSection:
      "Upsell на презентации считает конверсии к сделкам по квартирам. Здесь количество квартир берётся из вашего черновика (сумма четырёх жилых линеек в штуках); рублёвые планы upsell и нормативы конверсии остаются из mock-отчёта, чтобы связка была как на слайде.",
    whySection:
      up.driver === "base"
        ? `Драйвер — база квартир в рабочей таблице: ${numFmt.format(aptF)} / ${numFmt.format(aptP)} влияет на масштаб upsell (недобор базы ~${compactRub(up.volumePenaltyRub)} к полному плану в рублях).`
        : up.driver === "conversion"
          ? `Драйвер — конверсия при текущей базе: разрыв ~${compactRub(up.convPenaltyRub)} между масштабированным планом и фактом.`
          : `База и конверсия близки по вкладу: ~${compactRub(up.volumePenaltyRub)} и ~${compactRub(up.convPenaltyRub)}.`,
  };

  return [salesTempo, structure, upsell];
}
