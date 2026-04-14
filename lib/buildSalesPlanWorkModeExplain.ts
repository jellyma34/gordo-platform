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
  tempoWorkPoints: SalesPlanExplainInteractivePoint[],
): { formulaDetailCards: ExplainFormulaDetailCard[]; formulaSectionFooter: string } {
  const { scenario, savedAt, metricTab } = payload;
  const sliceNote = `Сценарий: ${scenarioLabel} (${scenario}). Снимок: ${savedAt}. Вкладка метрик при переходе: ${SALES_PLAN_METRIC_LABELS[metricTab]}.`;
  const monthDevU = sumFactMonthU - sumPlanMonthU;
  const n = Math.max(1, tempoWorkPoints.length);
  const planPerMonth = sumPlanMonthU / n;
  const actualPerMonth = sumFactMonthU / n;
  const velocityCompletionPct = planPerMonth > 0 ? Math.round((actualPerMonth / planPerMonth) * 100) : 0;

  const formulaDetailCards: ExplainFormulaDetailCard[] = [
    {
      name: "Суммы плана и факта (штуки, таблица)",
      metricId: "sumPlanFact",
      formula: "Σ plan_month = сумма planMonth по строкам таблицы; Σ fact_month = сумма factMonth по тем же строкам.",
      variables: [
        { symbol: "Σ plan_month", label: "план, шт.", value: numFmt.format(sumPlanMonthU) },
        { symbol: "Σ fact_month", label: "факт, шт.", value: numFmt.format(sumFactMonthU) },
        { symbol: "Δ", label: "факт − план", value: `${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))}` },
      ],
      calculation: `Σ plan_month = ${numFmt.format(sumPlanMonthU)}, Σ fact_month = ${numFmt.format(sumFactMonthU)} → Δ ${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))} шт. ${sliceNote}`,
      whyThisFormula:
        "Сумма по строкам таблицы задаёт масштаб сделок на снимке — те же величины, что складываются в столбцы «Факт vs план» в этом блоке.",
      interpretation:
        monthDevU >= 0
          ? "Совокупный факт не ниже совокупного плана по штукам — базовый сигнал по объёму неотрицательный."
          : "Совокупный факт ниже плана по штукам — смотрите столбцы графика, где отставание больше всего.",
    },
    {
      name: "Ровная норма на шаг ряда (план)",
      metricId: "planPerMonth",
      formula: "planPerMonth = Σ plan_month / N — равномерная норма сделок на один шаг ряда (здесь N = число строк/столбцов в графике).",
      variables: [
        { symbol: "Σ plan_month", label: "сумма плана", value: numFmt.format(sumPlanMonthU) },
        { symbol: "N", label: "число шагов", value: String(n) },
        { symbol: "planPerMonth", label: "норма, сделок/шаг", value: dec1.format(planPerMonth) },
      ],
      calculation: `planPerMonth = ${numFmt.format(sumPlanMonthU)} / ${n} = ${dec1.format(planPerMonth)} сделок. ${sliceNote}`,
      whyThisFormula:
        "Горизонталь на графике «Темп по месяцам» — это ровная норма: к чему сравнивается скользящий факт по шагам ряда.",
      interpretation:
        "Если столбцы часто ниже этой логики нормы по шагам, линия факта обычно окажется под пунктиром нормы.",
    },
    {
      name: "Скользящий средний факт по шагам",
      metricId: "actualPerMonth",
      formula: "actualPerMonth = (сумма факта с 1-го по k-й шаг) / k; на последнем шаге k = N совпадает с Σ fact_month / N при полном ряду.",
      variables: [
        { symbol: "Σ fact_month", label: "сумма факта", value: numFmt.format(sumFactMonthU) },
        { symbol: "N", label: "число шагов", value: String(n) },
        { symbol: "actualPerMonth", label: "средний факт", value: dec1.format(actualPerMonth) },
      ],
      calculation: `На полном ряду: ${numFmt.format(sumFactMonthU)} / ${n} = ${dec1.format(actualPerMonth)} сделок. ${sliceNote}`,
      whyThisFormula:
        "Цветная линия на графике показывает накопленный средний факт — насколько вы тянете плановую планку по мере прохождения ряда.",
      interpretation:
        actualPerMonth >= planPerMonth * 0.995
          ? "Средний факт у нормы или выше — линия держится у горизонтали плана."
          : "Средний факт ниже нормы — без усиления закрытия общий план по штукам под угрозой.",
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
        "Один процент отвечает на вопрос: «в среднем дотягиваем ли до плановой планки на шаг ряда».",
      interpretation:
        velocityCompletionPct >= 100
          ? "Не ниже 100% к норме — средний темп не проигрывает ровному плану."
          : `Ниже 100% — средний темп отстаёт; усильте закрытие на слабых столбцах «Факт vs план».`,
    },
    {
      name: "Сравнение факта и плана по столбцам",
      metricId: "monthlyCompare",
      formula:
        "На каждой колонке графика «Факт vs план» в штуках: рядом отображаются fact_month и plan_month по категории/шагу ряда; совокупное отклонение по снимку Δ = Σ fact_month − Σ plan_month.",
      variables: [
        { symbol: "Σ fact_month", label: "сумма факта по строкам", value: numFmt.format(sumFactMonthU) },
        { symbol: "Σ plan_month", label: "сумма плана по строкам", value: numFmt.format(sumPlanMonthU) },
        { symbol: "Δ", label: "Σ факт − Σ план", value: `${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))}` },
      ],
      calculation: `Совокупно по таблице: ${numFmt.format(sumFactMonthU)} − ${numFmt.format(sumPlanMonthU)} = ${monthDevU >= 0 ? "+" : "−"}${numFmt.format(Math.abs(monthDevU))} шт. На каждом столбце то же сравнение в паре «серый план / жёлтый факт» для своей категории. ${sliceNote}`,
      whyThisFormula:
        "Помесячное (покатегорийное) сравнение показывает, где именно «просели» или перевыполнили план, в отличие от одной средней линии темпа по всему ряду.",
      interpretation:
        monthDevU >= 0
          ? "Совокупно факт не ниже плана — отдельные столбцы всё равно могут проседать; смотрите категории с наибольшим отрицательным зазором."
          : "Совокупно факт ниже плана — приоритет на категории и периоды с наибольшим отрицательным отклонением на столбцах.",
    },
    {
      name: "Доля факта к плану (совокупно)",
      metricId: "monthlyRatio",
      formula:
        "Совокупная доля выполнения в штуках (%) = Σ fact_month / Σ plan_month × 100% при Σ plan_month > 0; по одному столбцу в отчёте аналогично: fact_month / plan_month × 100%.",
      variables: [
        {
          symbol: "Σ fact / Σ plan",
          label: "штуки",
          value: `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)}`,
        },
        { symbol: "%", label: "факт к плану", value: `${monthRatioU}%` },
      ],
      calculation:
        sumPlanMonthU > 0
          ? `${numFmt.format(sumFactMonthU)} / ${numFmt.format(sumPlanMonthU)} × 100% = ${monthRatioU}%. ${sliceNote}`
          : `План в штуках = 0 — долю не считаем. ${sliceNote}`,
      whyThisFormula:
        "Процент по совокупным штукам даёт быстрый ответ: закрыли ли вы объём относительно суммарного плана строк.",
      interpretation:
        sumPlanMonthU <= 0
          ? "Нулевой план — ориентируйтесь на абсолютный факт и на отдельные столбцы."
          : Number(monthRatioU) >= 100
            ? "Не ниже 100% — совокупный факт не проигрывает плану."
            : `Меньше 100% — совокупный недобор; усиливайте закрытие.`,
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

  const tempoWorkPoints: SalesPlanExplainInteractivePoint[] = SALES_PLAN_CATEGORY_IDS.map((id) => {
    const u = slice.units[id];
    const dev = u.factMonth - u.planMonth;
    return {
      pointId: `work-tempo:${id}`,
      label: SALES_PLAN_CATEGORY_LABELS[id],
      plan: u.planMonth,
      fact: u.factMonth,
      detailLine: `${SALES_PLAN_CATEGORY_LABELS[id]}: план ${numFmt.format(u.planMonth)} шт., факт ${numFmt.format(u.factMonth)} шт., Δ ${dev >= 0 ? "+" : "−"}${numFmt.format(Math.abs(dev))} шт.`,
    };
  });

  const workTempoFormulas = buildWorkModeSalesTempoFormulaDetailCards(
    payload,
    scenarioLabel,
    sumPlanMonthU,
    sumFactMonthU,
    monthRatioU,
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
      `Шт.: Σ plan_month = ${numFmt.format(sumPlanMonthU)}, Σ fact_month = ${numFmt.format(sumFactMonthU)} → ${monthRatioU}% (факт/план по сумме строк).`,
    ],
    howSection:
      "В рабочем режиме нет помесячного ряда как на слайде презентации: темп показывается как сумма по категориям за «текущий месяц» в таблице (plan_month / fact_month) и накопительные итоги по штукам и выручке после формулы факта.",
    whySection:
      Number(monthRatioU) >= 100
        ? "По сумме строк таблицы факт не ниже плана в штуках — оперативный объём выдержан."
        : Number(monthRatioU) >= 95
          ? "Небольшой недобор по сумме plan_month — темп близок к целевому; проверьте столбцы с отставанием на графике."
          : "Факт по сумме строк ниже плана — усильте закрытие там, где столбцы «Факт vs план» дают наибольший минус.",
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
