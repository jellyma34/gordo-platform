import {
  analyzeUpsellDiagnostic,
  type ExplainFormulaDetailCard,
  SALES_TEMPO_EXPLAIN_INTRO_WORK,
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

function buildWorkModeSalesTempoFormulaDetailCards(
  payload: SalesPlanExplainSessionPayload,
  scenarioLabel: string,
  sumPlanMonthU: number,
  sumFactMonthU: number,
  monthRatioU: string,
  sumPlanCumU: number,
  sumFactCumU: number,
  cumPctU: number,
  sumPlanMonthR: number,
  sumFactMonthR: number,
  monthRatioR: string,
  sumPlanCumR: number,
  sumFactCumR: number,
  cumPctR: number,
  tempoWorkPoints: SalesPlanExplainInteractivePoint[],
): { formulaDetailCards: ExplainFormulaDetailCard[]; formulaSectionFooter: string } {
  const { scenario, savedAt, metricTab } = payload;
  const sliceNote = `Сценарий: ${scenarioLabel} (${scenario}). Снимок: ${savedAt}. Вкладка метрик при переходе: ${SALES_PLAN_METRIC_LABELS[metricTab]}.`;
  const monthDevU = sumFactMonthU - sumPlanMonthU;
  const first = tempoWorkPoints[0];

  const formulaDetailCards: ExplainFormulaDetailCard[] = [
    {
      name: "Суммы плана и факта по таблице (текущий месяц, шт.)",
      formula: "Σ plan_month = сумма planMonth по всем категориям (1к … коммерция); Σ fact_month = сумма factMonth по тем же строкам.",
      variables: [
        { symbol: "Σ plan_month", label: "план текущего месяца, шт.", value: numFmt.format(sumPlanMonthU) },
        { symbol: "Σ fact_month", label: "факт текущего месяца, шт.", value: numFmt.format(sumFactMonthU) },
        { symbol: "Δ мес.", label: "факт − план", value: `${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))}` },
      ],
      calculation: `По снимку: Σ plan_month = ${numFmt.format(sumPlanMonthU)}, Σ fact_month = ${numFmt.format(sumFactMonthU)} → отклонение ${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))} шт. ${sliceNote}`,
      whyThisFormula:
        "В рабочем режиме нет календарного помесячного ряда отчёта — оперативный «темп месяца» в штуках задаётся суммой строк вашей таблицы по выбранному сценарию.",
      interpretation:
        monthDevU >= 0
          ? "По сумме категорий факт месяца не ниже плана в штуках — базовый оперативный сигнал неотрицательный."
          : "По сумме категорий факт месяца ниже плана в штуках — смотрите линейки с наибольшим отставанием в списке точек ниже.",
    },
    {
      name: "Доля выполнения месяца (шт.)",
      formula: "Месяц (%) = Σ fact_month / Σ plan_month × 100% при Σ plan_month > 0.",
      variables: [
        {
          symbol: "Σ fact / Σ план",
          label: "штуки за месяц",
          value: `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)}`,
        },
        { symbol: "Месяц, %", label: "факт к плану", value: `${monthRatioU}%` },
      ],
      calculation:
        sumPlanMonthU > 0
          ? `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)} × 100% = ${monthRatioU}%. ${sliceNote}`
          : `План месяца в штуках = 0 — долю не считаем. ${sliceNote}`,
      whyThisFormula:
        "Процент даёт тот же смысл, что и на презентации: один взгляд — закрыли ли месяц относительно суммарного плана строк таблицы.",
      interpretation:
        sumPlanMonthU <= 0
          ? "Нулевой план в штуках на месяц — ориентируйтесь на абсолютный факт и на выручку."
          : Number(monthRatioU) >= 100
            ? "Не ниже 100% по сумме категорий — месячный темп в штуках выдержан или перевыполнен."
            : `Месяц ${monthRatioU}% к суммарному плану — оперативный недобор по штукам в таблице.`,
    },
    {
      name: "Накопительно по штукам (все категории)",
      formula: "Свод (нак., %) = Σ fact_cum / Σ plan_cum × 100% — накопительные поля по строкам после формулы факта в таблице.",
      variables: [
        { symbol: "Σ plan_нак.", label: "план нарастающим", value: numFmt.format(sumPlanCumU) },
        { symbol: "Σ fact_нак.", label: "факт нарастающим", value: numFmt.format(sumFactCumU) },
        { symbol: "Свод, %", label: "исполнение", value: `${cumPctU}%` },
      ],
      calculation: `Σ fact_нак. / Σ plan_нак. = ${numFmt.format(sumFactCumU)} / ${numFmt.format(sumPlanCumU)} = ${cumPctU}%. ${sliceNote}`,
      whyThisFormula:
        "Накопительный процент отвечает на вопрос «как идёт год к плану по штукам» на дату снимка, даже без слайда презентации.",
      interpretation:
        cumPctU >= 100
          ? "Накопительно по штукам не ниже плана в сумме строк — задел по «штукам» на дату черновика выдержан."
          : `Свод ${cumPctU}%: накопленный факт отстаёт от суммарного плана категорий — нужен догон по месяцам или слабым линейкам.`,
    },
    {
      name: "Выручка: месяц и накопительно",
      formula: "Те же суммы и отношения для revenue[*].planMonth / factMonth и накопительных план/факт по выручке.",
      variables: [
        { symbol: "Месяц, % (руб.)", label: "факт/план по выручке", value: `${monthRatioR}%` },
        { symbol: "Σ plan_нак. (руб.)", label: "план накопительно", value: compactRub(sumPlanCumR) },
        { symbol: "Σ fact_нак. (руб.)", label: "факт накопительно", value: compactRub(sumFactCumR) },
        { symbol: "Свод (руб.), %", label: "исполнение", value: `${cumPctR}%` },
      ],
      calculation: `Месяц: ${compactRub(sumFactMonthR)} / ${compactRub(sumPlanMonthR)} → ${monthRatioR}%. Накопительно: ${compactRub(sumFactCumR)} / ${compactRub(sumPlanCumR)} → ${cumPctR}%. ${sliceNote}`,
      whyThisFormula:
        "Штуки и рубли могут расходиться из‑за микса и среднего чека — дублируем логику для выручки, как в подсказках рабочего плана.",
      interpretation:
        cumPctR >= 100 && cumPctU >= 100
          ? "И по рублям, и по штукам накопительно не хуже плана — темп согласован с деньгами."
          : `Накопительно выручка ${cumPctR}% при штуках ${cumPctU}% — проверьте структуру и средний чек в таблице.`,
    },
    {
      name: "Строки категорий (сравнение план / факт)",
      formula: "В каждой строке: planMonth и factMonth как пара «план / факт»; наведение в explain подсвечивает ту же пару на упрощённом графике.",
      variables: first
        ? [
            { symbol: "Пример", label: first.label, value: `план ${numFmt.format(first.plan)}, факт ${numFmt.format(first.fact)}` },
          ]
        : [],
      calculation: first
        ? `${first.detailLine}. Всего категорий в блоке: ${tempoWorkPoints.length}. ${sliceNote}`
        : `Нет строк категорий. ${sliceNote}`,
      whyThisFormula:
        "Интерактив explain повторяет логику «факт vs план», но строит ряд из строк таблицы, а не календарных месяцев отчёта.",
      interpretation:
        "Ищите категории, где factMonth заметно ниже planMonth — они формируют оперативный недобор по сумме строк.",
    },
  ];

  const formulaSectionFooter =
    Number(monthRatioU) >= 100
      ? "Итог по снимку: суммарно факт месяца в штуках не ниже суммарного плана строк — контролируйте слабые линейки, чтобы не потерять запас."
      : `Итог по снимку: месяц ${monthRatioU}% (шт.) — усильте закрытие в категориях с наибольшим отставанием.`;

  return { formulaDetailCards, formulaSectionFooter };
}

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

  const workTempoFormulas = buildWorkModeSalesTempoFormulaDetailCards(
    payload,
    scenarioLabel,
    sumPlanMonthU,
    sumFactMonthU,
    monthRatioU,
    sumPlanCumU,
    sumFactCumU,
    cumPctU,
    sumPlanMonthR,
    sumFactMonthR,
    monthRatioR,
    sumPlanCumR,
    sumFactCumR,
    cumPctR,
    tempoWorkPoints,
  );

  const salesTempo: SalesPlanPresentationExplainBlock = {
    id: "salesTempo",
    title: "Темп продаж",
    dataSources: [
      `Рабочий режим: grid[${scenario}].units и .revenue — поля planMonth, factMonth, planCumulative (снимок в sessionStorage).`,
      "Факт накопительно по строке: planCumulative + (factMonth − planMonth).",
      "Сводка по всем категориям таблицы (1к … коммерция).",
    ],
    introDescription: SALES_TEMPO_EXPLAIN_INTRO_WORK,
    formulaLines: [],
    formulaDetailCards: workTempoFormulas.formulaDetailCards,
    formulaSectionFooter: workTempoFormulas.formulaSectionFooter,
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
