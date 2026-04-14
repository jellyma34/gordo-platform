import {
  analyzeUpsellDiagnostic,
  type SalesPlanExplainInteractivePoint,
  type SalesPlanPresentationExplainBlock,
} from "@/lib/buildSalesPlanPresentationExplain";
import { marketingSalesReportMock } from "@/lib/marketingSalesReportData";
import { SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS } from "@/lib/salesPlanPresentationExplainConfig";
import type { SalesPlanExplainSessionPayload } from "@/lib/salesPlanExplainSession";
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

export function buildSalesPlanWorkModeExplainBlocks(payload: SalesPlanExplainSessionPayload): SalesPlanPresentationExplainBlock[] {
  const cfg = SALES_PLAN_PRESENTATION_EXPLAIN_CHARTS;
  const { scenario, grid, metricTab, savedAt } = payload;
  const slice = grid[scenario];
  const scenarioLabel = SALES_PLAN_SCENARIO_LABELS[scenario];

  let sumPlanMonthU = 0;
  let sumFactMonthU = 0;
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
    sumPlanMonthU += u.planMonth;
    sumFactMonthU += u.factMonth;
    sumPlanCumU += u.planCumulative;
    sumFactCumU += du.factCumulative;
    sumPlanMonthR += r.planMonth;
    sumFactMonthR += r.factMonth;
    sumPlanCumR += r.planCumulative;
    sumFactCumR += dr.factCumulative;
  }

  const monthRatioU = sumPlanMonthU > 0 ? ((sumFactMonthU / sumPlanMonthU) * 100).toFixed(1) : "—";
  const monthRatioR = sumPlanMonthR > 0 ? ((sumFactMonthR / sumPlanMonthR) * 100).toFixed(1) : "—";
  const cumPctU = sumPlanCumU > 0 ? Math.round((sumFactCumU / sumPlanCumU) * 100) : 0;
  const cumPctR = sumPlanCumR > 0 ? Math.round((sumFactCumR / sumPlanCumR) * 100) : 0;

  const tempoWorkPoints: SalesPlanExplainInteractivePoint[] = SALES_PLAN_CATEGORY_IDS.map((id) => {
    const u = slice.units[id];
    const du = deriveSalesPlanRow(u);
    const dev = u.factMonth - u.planMonth;
    return {
      pointId: `work-tempo:${id}`,
      label: SALES_PLAN_CATEGORY_LABELS[id],
      plan: u.planMonth,
      fact: u.factMonth,
      detailLine: `${SALES_PLAN_CATEGORY_LABELS[id]} (шт.): план мес. ${numFmt.format(u.planMonth)}, факт мес. ${numFmt.format(u.factMonth)}, план нак. ${numFmt.format(u.planCumulative)}, факт нак. ${numFmt.format(du.factCumulative)}; Δ мес. ${numFmt.format(dev)}`,
    };
  });

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: [
      `Рабочий режим: grid[${scenario}].units и .revenue — поля planMonth, factMonth, planCumulative (снимок в sessionStorage).`,
      "Факт накопительно по строке: planCumulative + (factMonth − planMonth).",
      "Сводка по всем категориям таблицы (1к … коммерция).",
    ],
    formulaLines: [
      "Σ plan_month, Σ fact_month по выбранному сценарию",
      "Отношение месяца: Σ fact_month / Σ plan_month",
      "Накопительно: Σ fact_cum / Σ plan_cum × 100% (по шт. и по выручке)",
      ...cfg.salesTempo.formulas.slice(1),
    ],
    interactive: { valueKind: "deals", points: tempoWorkPoints },
    calculationLines: [
      `Сценарий: ${scenarioLabel} (${scenario}). Активная метрика в таблице при переходе: ${SALES_PLAN_METRIC_LABELS[metricTab]}.`,
      `Снимок: ${savedAt} (черновик, без кэша сервера).`,
      `Шт.: Σ plan_month = ${numFmt.format(sumPlanMonthU)}, Σ fact_month = ${numFmt.format(sumFactMonthU)} → ${monthRatioU}% (факт/план месяца).`,
      `Шт.: Σ plan_нак. = ${numFmt.format(sumPlanCumU)}, Σ fact_нак. = ${numFmt.format(sumFactCumU)} → ${cumPctU}% выполнения.`,
      `Выручка: Σ plan_month = ${compactRub(sumPlanMonthR)}, Σ fact_month = ${compactRub(sumFactMonthR)} → ${monthRatioR}%.`,
      `Выручка: Σ plan_нак. = ${compactRub(sumPlanCumR)}, Σ fact_нак. = ${compactRub(sumFactCumR)} → ${cumPctR}% выполнения.`,
    ],
    howSection:
      "В рабочем режиме нет помесячного ряда как на слайде презентации: темп показывается как сумма по категориям за «текущий месяц» в таблице (plan_month / fact_month) и накопительные итоги по штукам и выручке после формулы факта.",
    whySection:
      Number(monthRatioU) >= 100
        ? "По сумме категорий факт месяца не ниже плана — темп месяца выдержан; накопительный % показывает, тянется ли весь объём к плану на дату."
        : Number(monthRatioU) >= 95
          ? "Небольшой недобор по сумме plan_month категорий — темп близок к целевому; проверьте отдельные линейки в таблице."
          : "Факт месяца по сумме категорий ниже плана — это тот же сигнал, что и «просадка темпа» на презентации, но на уровне агрегата рабочей таблицы.",
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
