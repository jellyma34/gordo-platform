import type { KpiDashboardItem, KpiCardTone } from "@/components/marketing/SalesPlanKpiDashboard";
import type {
  ExplainFormulaDetailCard,
  ExplainMetricContent,
  ExplainMetricDescription,
  ExplainMetricDiagnostics,
} from "@/lib/buildSalesPlanPresentationExplain";
import {
  calculateDeviation,
  getProjectStats,
  getStatusByDeviation,
  getStatusLabel,
  PROJECT_PARTS,
  type GPRTask,
} from "@/lib/gprUtils";
import { computeConstructionStructureDiagnostic } from "@/lib/constructionStructureDiagnosticMetrics";
import { contractDeviationDays, type Tender } from "@/lib/tenderData";
import { tmcFactReferenceDate, tmcPlanReferenceDate, type TMCItem } from "@/lib/tmcData";

const MS_DAY = 86_400_000;

function toneFromDeviationDays(d: number | null): KpiCardTone {
  if (d === null) return "yellow";
  const s = getStatusByDeviation(Math.round(d));
  if (s === "green") return "green";
  if (s === "yellow") return "yellow";
  return "red";
}

function kpiToolTip(
  metricMeaning: string,
  formula: string,
  calculation: string,
  explanation: string,
  interpretation: string,
  fact: string,
  plan: string,
  deviation: string,
): KpiDashboardItem["tooltip"] {
  return {
    metricMeaning,
    formula,
    variables: [],
    calculation,
    explanation,
    interpretation,
    fact,
    plan,
    deviation,
    miniChart: "На карточках презентации мини-графики не выводятся.",
    conclusion: "См. блок «Формулы и расчёты» ниже для расшифровки.",
  };
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function tenderDistribution(tenders: Tender[], today: Date) {
  let conducted = 0;
  let inProgress = 0;
  let overdue = 0;
  let noData = 0;
  for (const t of tenders) {
    const plan = parseIsoDate(t.planContractDate);
    const fact = parseIsoDate(t.factContractDate);
    if (fact) conducted += 1;
    else if (!plan) noData += 1;
    else if (plan.getTime() < today.getTime()) overdue += 1;
    else inProgress += 1;
  }
  const total = tenders.length;
  const riskScore = total > 0 ? (overdue * 1 + inProgress * 0.5) / total : 0;
  const riskPct = Math.round(riskScore * 100);
  return { conducted, inProgress, overdue, noData, total, riskPct };
}

function tmcDeviationDays(item: TMCItem): number | null {
  const pr = tmcPlanReferenceDate(item);
  const fr = tmcFactReferenceDate(item);
  if (!pr || !fr) return null;
  const p = new Date(`${pr}T00:00:00`).getTime();
  const f = new Date(`${fr}T00:00:00`).getTime();
  if (!Number.isFinite(p) || !Number.isFinite(f)) return null;
  return Math.round((f - p) / MS_DAY);
}

function tmcEnriched(items: TMCItem[]) {
  return items.map((item) => {
    const dev = tmcDeviationDays(item);
    const factRef = tmcFactReferenceDate(item);
    let status: "green" | "yellow" | "red" | "gray" | "overdue_not_started" = "gray";
    if (!factRef) {
      const planRef = tmcPlanReferenceDate(item);
      if (planRef) {
        const p = new Date(`${planRef}T00:00:00`).getTime();
        const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
        if (p < todayStart) status = "overdue_not_started";
      }
    } else if (dev !== null) {
      status = getStatusByDeviation(dev) as typeof status;
    }
    return { ...item, deviation: dev, traffic: status };
  });
}

const GPR_INTRO: ExplainMetricDescription = {
  whatItIs:
    "График производства работ (ГПР): задачи с планом и фактом по срокам и процентом выполнения. Отклонение по карточкам этапов считается так же, как в таблице и на диаграмме «План vs Факт».",
  purpose:
    "Увидеть общий прогресс части проекта, «светофор» по срокам и узкие места до углубления в детальные графики.",
  whyImportant:
    "Срыв ключевых этапов сдвигает последователей, закупки ТМЦ и тендеры. Ранний сигнал по отклонению дешевле, чем ликвидация хвоста у ввода.",
  howItAffects:
    "Рост доли красных этапов и среднего отклонения — повод усилить оперативное планирование, разблокировки и выравнивание фронта работ.",
};

const TENDERS_INTRO: ExplainMetricDescription = {
  whatItIs:
    "Реестр закупок услуг по этапам ГПР: плановые и фактические даты договоров, статусы проведения. Верхние карточки и график «План vs Факт» используют те же определения статусов.",
  purpose:
    "Контролировать своевременность тендерного цикла относительно строительного графика и не допускать «окна» без договора на критическом пути.",
  whyImportant:
    "Просроченный тендер блокирует работы и удорожает сроки. Наглядная доля проведённых и риск-индекс помогают приоритизировать юридическую и закупочную поддержку.",
  howItAffects:
    "Рост доли просроченных и индекса риска — сигнал пересмотреть план дат, ресурс ЦЗ и параллельность подготовки конкурентных процедур.",
};

const TMC_INTRO: ExplainMetricDescription = {
  whatItIs:
    "Закупка материалов (ТМЦ): позиции по части проекта с плановой и фактической стоимостью и опорными датами. Карточки сверху совпадают с презентационным экраном ТМЦ.",
  purpose:
    "Свести выполнение бюджета, экономию/перерасход и срывы поставок к одному срезу перед детализацией и графиками.",
  whyImportant:
    "Материалы напрямую завязаны на ГПР: задержка поставки или перерасход бюджара меняют сроки и маржу. Статусы по датам дают тот же язык, что и «светофор» ГПР (порог 14 дн.).",
  howItAffects:
    "Высокая доля просрочек и отрицательная «экономия» как перерасход требуют закупочных решений и корректировки графика работ.",
};

const STRUCTURE_DIAGNOSTIC_INTRO: ExplainMetricDescription = {
  whatItIs:
    "Разложение отставания ГПР на причины: тендеры (подписанный договор по этапу), ТМЦ (факт поставки по связанным позициям) и исполнение (отклонение по срокам при уже закрытых договоре и снабжении).",
  purpose:
    "Понять, где реальная причина срыва сроков — в закупке услуг, в обеспечении материалами или в производстве работ.",
  whyImportant:
    "ГПР в первую очередь показывает симптом по календарю; этот блок связывает симптом с типовыми корневыми причинами по тем же задачам и реестрам.",
  howItAffects:
    "Позволяет направить действия: усилить тендерный контур, снабжение или непосредственно стройку и координацию на объекте.",
};

export type ConstructionExplainSection = {
  id: "gpr" | "structure" | "tenders" | "tmc";
  title: string;
  description: ExplainMetricDescription;
  kpiItems: KpiDashboardItem[];
  formulas: ExplainMetricContent;
};

export function buildConstructionPresentationExplain(
  partId: number | "all",
  tasks: GPRTask[],
  tenders: Tender[],
  tmcItems: TMCItem[],
): { partName: string; sections: ConstructionExplainSection[] } {
  const partName =
    partId === "all"
      ? "Проект (сводно)"
      : (PROJECT_PARTS.find((p) => p.id === partId)?.name ?? "Часть проекта");
  const today = new Date();
  const stats = getProjectStats(tasks);
  const completedPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const sampleDev = tasks
    .map((t) => ({ t, d: calculateDeviation(t) }))
    .find((x) => x.d !== null);
  const exTask = sampleDev?.t;
  const exD = sampleDev?.d ?? null;
  let deviationExampleCalc = "Нет задач с расчётным отклонением на текущую дату.";
  let deviationExampleFormula = "Δ = end_day − plan_end_day (см. обозначения).";
  if (exTask && exD !== null) {
    const pe = exTask.planEnd?.trim();
    const fe = exTask.factEnd?.trim();
    if (fe && pe) {
      deviationExampleFormula = "Δ = day(fact_end) − day(plan_end)";
      deviationExampleCalc = `«${exTask.name}»: plan_end = ${pe}, fact_end = ${fe} → Δ = ${exD > 0 ? "+" : ""}${exD} дн.`;
    } else if (pe) {
      deviationExampleFormula = "Нет fact_end → Δ = day(сегодня) − day(plan_end) (после plan_start с фактом или без него — по правилу calculateDeviation)";
      const todayStr = today.toISOString().slice(0, 10);
      deviationExampleCalc = `«${exTask.name}»: plan_end = ${pe}, факт окончания ещё не зафиксирован, отчётная дата = ${todayStr} → Δ = ${exD > 0 ? "+" : ""}${exD} дн.`;
    }
  }

  const avgDev = stats.avgDeviation;
  const avgList = tasks
    .map((t) => calculateDeviation(t))
    .filter((v): v is number => v !== null);
  const avgSum = avgList.reduce((s, v) => s + v, 0);
  const avgFormulaCalc =
    avgList.length > 0
      ? `Σ отклонений = ${avgSum.toFixed(1)} по ${avgList.length} задач(ам) → среднее = ${avgDev > 0 ? "+" : ""}${avgDev} дн.`
      : "Нет задач с ненулевым расчётом — среднее = 0.";

  const gprDiagnostics: ExplainMetricDiagnostics = {
    typicalProblems: [
      "Много этапов в красной зоне (>14 дн.) при незакрытом факте по срокам.",
      "Высокое среднее отклонение при формально «зелёных» отдельных работах — проблема в хвосте или несопоставимых планах.",
      "Задачи без дат плана — серые статусы, искажающие общую картину готовности.",
    ],
    whereToLook: [
      "Карточки верхнего уровня этапов и строки с максимальным положительным отклонением в таблице ГПР.",
      "Диаграмма «План vs Факт» и сводка по длительностям/окончанию проекта в той же аналитике.",
      "Связанные позиции ТМЦ и тендеры по кодам этапов.",
    ],
    managementTakeaways: [
      "Зафиксировать единые даты плана и факта по критическому пути; еженедельно пересматривать красные этапы.",
      "Для отставания без ресурса — сценарии сокращения объёма или переноса зависимых работ.",
      "Для системного «жёлтого» коридора — проверить качество исходных длительностей в плане.",
    ],
  };

  const gprFormulas: ExplainFormulaDetailCard[] = [
    {
      name: "Отклонение по сроку (дни)",
      formula: deviationExampleFormula,
      variables: [
        { symbol: "plan_end", label: "дата окончания по плану (календарный день)", value: exTask?.planEnd ?? "—" },
        { symbol: "fact_end", label: "дата окончания по факту", value: exTask?.factEnd ?? "—" },
        { symbol: "сегодня", label: "отчётная дата, если факта окончания нет", value: today.toISOString().slice(0, 10) },
      ],
      calculation: deviationExampleCalc,
      whyThisFormula:
        "Та же логика, что в `planFactEndDeviationDays` / `calculateDeviation`: положительное значение — факт или «сегодня» правее плана, отрицательное — опережение.",
      interpretation:
        exD === null
          ? "Недостаточно данных для интерпретации по выбранной задаче."
          : `Пороги «светофора»: ≤0 дн. — в срок; 1–14 дн. — риск; >14 дн. — отставание (${getStatusLabel(getStatusByDeviation(Math.round(exD)))}).`,
    },
    {
      name: "Среднее отклонение по задачам",
      formula: "avg = (1/N) × Σ Δᵢ , где Δᵢ — отклонение по задаче i (если посчитано)",
      variables: [
        { symbol: "N", label: "число задач с ненулевым расчётом отклонения", value: String(avgList.length) },
        { symbol: "Σ Δᵢ", label: "сумма отклонений", value: avgList.length ? avgSum.toFixed(1) : "0" },
      ],
      calculation: avgFormulaCalc,
      whyThisFormula:
        "Агрегирует «светофор» по листу: одна цифра для сравнения частей проекта и динамики после обновления факта.",
      interpretation:
        avgDev <= 0
          ? "В среднем этапы укладываются в план или опережают его."
          : `Среднее +${avgDev} дн. — суммарное отставание по срокам окончания; выше 14 дн. усиливает риск для зависимых работ.`,
    },
    {
      name: "Доля завершённых задач",
      formula: "P = (завершено / всего) × 100%, завершено: completion ≥ 100%",
      variables: [
        { symbol: "завершено", label: "число задач", value: String(stats.completed) },
        { symbol: "всего", label: "число задач в срезе", value: String(stats.total) },
      ],
      calculation:
        stats.total > 0
          ? `${stats.completed} / ${stats.total} × 100% = ${completedPct}%`
          : "Нет задач в выбранной части проекта.",
      whyThisFormula:
        "Совпадает с верхнеуровневой карточкой «Завершено» и показывает, какая доля работ закрыта по проценту, не только по срокам.",
      interpretation:
        completedPct >= 80
          ? "Высокая доля закрытых работ — при отсутствии красных отклонений по срокам картина устойчивая."
          : "Низкая доля при наличии дат плана — проверить реальное состояние фронта и обновление % выполнения.",
    },
  ];

  const gprKpis: KpiDashboardItem[] = [
    {
      key: "gpr-total",
      title: "Всего задач",
      value: String(stats.total),
      sub: partName,
      description: "Количество строк ГПР в выбранной части проекта.",
      tone: "yellow",
      hover: `В срезе: ${stats.total} задач(и)`,
      tooltip: kpiToolTip(
        "Размер портфеля работ для части проекта.",
        "Счётчик задач после фильтра по partId.",
        `Итого задач: ${stats.total}`,
        "Не метрика качества; нужна в паре со статусами и отклонениями.",
        "Рост числа задач без роста завершения — признак распухания структуры или декомпозиции.",
        String(stats.total),
        "—",
        "—",
      ),
    },
    {
      key: "gpr-done",
      title: "Завершено (100%)",
      value: String(stats.completed),
      sub: `${completedPct}% от списка`,
      description: "Задачи с completion ≥ 100%.",
      tone: completedPct >= 70 ? "green" : "yellow",
      hover: `${stats.completed} из ${stats.total} закрыты по проценту`,
      tooltip: kpiToolTip(
        "Готовность по заявленному проценту выполнения.",
        "P = завершено / всего × 100%",
        stats.total > 0 ? `${stats.completed} / ${stats.total} = ${completedPct}%` : "—",
        "Не заменяет контроль сроков: работа может быть «100%» с опозданием.",
        completedPct >= 80 ? "Доля закрытых работ высокая." : "Имеет смысл сопоставить с отклонениями по датам.",
        String(stats.completed),
        String(stats.total),
        `${completedPct}%`,
      ),
    },
    {
      key: "gpr-overdue",
      title: "Критические (>14 дн.)",
      value: String(stats.overdue),
      sub: "по отклонению окончания",
      description: "Задачи с отклонением строго больше 14 дней (как в сводной логике ГПР).",
      tone: stats.overdue > 0 ? "red" : "green",
      hover: `Задач с Δ > 14 дн.: ${stats.overdue}`,
      tooltip: kpiToolTip(
        "Хвост риска по тем же порогам, что «светофор» красного уровня.",
        "overdue = count(Δᵢ > 14)",
        `На дату отчёта: ${stats.overdue} задач(и)`,
        "Считается по рассчитанным отклонениям срока окончания.",
        stats.overdue > 0 ? "Есть этапы, требующие плана ликвидации отставания." : "Нет задач за красным порогом.",
        String(stats.overdue),
        "порог 14 дн.",
        "—",
      ),
    },
    {
      key: "gpr-avg",
      title: "Среднее отклонение",
      value: `${avgDev > 0 ? "+" : ""}${avgDev} дн.`,
      sub: "по задачам с Δ",
      description: "Среднее арифметическое отклонений, где удалось посчитать Δ.",
      tone: toneFromDeviationDays(avgDev),
      hover: `Среднее: ${avgDev} дн.`,
      tooltip: kpiToolTip(
        "Сводная метрика сдвига сроков по листу.",
        "avg = ΣΔ / N",
        avgFormulaCalc,
        "Чувствительно к выбросам: несколько сильно красных задач тянут среднее вверх.",
        avgDev <= 0 ? "В среднем сроки не хуже плана." : `Средний сдвиг +${avgDev} дн. — проверить топ-отклонения.`,
        String(avgList.length),
        `ΣΔ=${avgSum.toFixed(1)}`,
        `${avgDev} дн.`,
      ),
    },
  ];

  const dist = tenderDistribution(tenders, today);
  const conductedPct =
    dist.total > 0 ? Math.round((dist.conducted / dist.total) * 1000) / 10 : 0;
  const withContractDates = tenders.filter((t) => contractDeviationDays(t) !== null);
  const sampleContract = withContractDates[0];
  const cDev = sampleContract ? contractDeviationDays(sampleContract)! : null;
  const contractCalc =
    sampleContract && cDev !== null
      ? `«${sampleContract.name}»: факт договора минус план = ${cDev > 0 ? "+" : ""}${cDev} дн.`
      : "Нет пары план/факт по дате договора для числового примера.";

  const tenderDiagnostics: ExplainMetricDiagnostics = {
    typicalProblems: [
      "Рост доли просроченных: плановая дата договора в прошлом, факт отсутствует.",
      "Высокий индекс риска при большом числе «в процессе» — узкое горлышко подготовки документации или согласований.",
      "Нет плановых дат — позиции попадают в «Нет данных» и выпадают из кривой плана.",
    ],
    whereToLook: [
      "Карточки «Проведены / В процессе / Просрочены» и круговая диаграмма статусов.",
      "График «План vs Факт»: отрыв серой линии факта от плана по оси Y.",
      "Таблица тендеров: колонки план/факт даты договора и привязка к этапу ГПР.",
    ],
    managementTakeaways: [
      "Для просроченных — дедлайн-план с ответственным и эскалацией; при необходимости временные договоры/НМЦК.",
      "Снизить «в процессе» за счёт пакетной подготовки и параллельных конкурсов на независимые лоты.",
      "Заполнить отсутствующие плановые даты, иначе мониторинг неполный.",
    ],
  };

  const tenderFormulas: ExplainFormulaDetailCard[] = [
    {
      name: "Доля проведённых тендеров",
      formula: "share_conducted = (N_fact / N_total) × 100%",
      variables: [
        { symbol: "N_fact", label: "число позиций с factContractDate", value: String(dist.conducted) },
        { symbol: "N_total", label: "все тендеры части проекта", value: String(dist.total) },
      ],
      calculation:
        dist.total > 0
          ? `${dist.conducted} / ${dist.total} × 100% = ${conductedPct}%`
          : "Тендеров в срезе нет.",
      whyThisFormula:
        "Та же метрика, что масштабирует ось Y на графике накопленного факта: доля заключённых договоров от реестра.",
      interpretation:
        conductedPct >= 90
          ? "Почти все позиции с договором — низкий реестровый хвост."
          : "Часть реестра без договора — смотреть просрочки и «в процессе».",
    },
    {
      name: "Индекс риска статусов",
      formula: "risk_index = ((N_overdue × 1) + (N_in_progress × 0.5)) / N_total × 100%",
      variables: [
        { symbol: "N_overdue", label: "план < сегодня, факта нет", value: String(dist.overdue) },
        { symbol: "N_in_progress", label: "план ≥ сегодня, факта нет", value: String(dist.inProgress) },
        { symbol: "N_total", label: "всего тендеров", value: String(dist.total) },
      ],
      calculation:
        dist.total > 0
          ? `((${dist.overdue}×1) + (${dist.inProgress}×0.5)) / ${dist.total} × 100% ≈ ${dist.riskPct}%`
          : "—",
      whyThisFormula:
        "Как на слайде тендеров: просрочка весит 1, «в процессе» — 0.5, чтобы отразить близость к срыву.",
      interpretation:
        dist.riskPct <= 15
          ? "Реестр в относительной безопасности по этому индексу."
          : "Индекс заметно выше — приоритизировать просроченные и ближайшие даты плана.",
    },
    {
      name: "Отклонение даты договора",
      formula: "Δ_contract = day(factContractDate) − day(planContractDate)",
      variables: sampleContract
        ? [
            { symbol: "plan", label: "план договора", value: sampleContract.planContractDate ?? "—" },
            { symbol: "fact", label: "факт договора", value: sampleContract.factContractDate ?? "—" },
          ]
        : [],
      calculation: contractCalc,
      whyThisFormula:
        "Показывает, на сколько дней сдвинулось подписание относительно плана — используется в диагностике этапов.",
      interpretation:
        cDev === null
          ? "Нет пары дат — отклонение не считается."
          : cDev > 0
            ? `Просрочка заключения на ${cDev} дн.`
            : `Опережение или в срок (${cDev} дн.).`,
    },
  ];

  const tenderKpis: KpiDashboardItem[] = [
    {
      key: "ten-total",
      title: "Всего тендеров",
      value: String(dist.total),
      sub: partName,
      description: "Позиции реестра в выбранной части проекта.",
      tone: "yellow",
      hover: `Всего: ${dist.total}`,
      tooltip: kpiToolTip("Размер реестра закупок.", "Счётчик после фильтра partId.", `${dist.total} строк`, "—", "—", String(dist.total), "—", "—"),
    },
    {
      key: "ten-done",
      title: "Проведены",
      value: String(dist.conducted),
      sub: "договор заключён",
      description: "Есть фактическая дата договора.",
      tone: dist.conducted === dist.total && dist.total > 0 ? "green" : "yellow",
      hover: `${dist.conducted} из ${dist.total}`,
      tooltip: kpiToolTip(
        "Факт проведения тендера.",
        "N_fact / N_total",
        dist.total > 0 ? `${dist.conducted} / ${dist.total} = ${conductedPct}%` : "—",
        "—",
        conductedPct >= 90 ? "Высокая доля закрытых." : "Есть незакрытые позиции.",
        String(dist.conducted),
        String(dist.total),
        `${conductedPct}%`,
      ),
    },
    {
      key: "ten-wip",
      title: "В процессе",
      value: String(dist.inProgress),
      sub: "до даты договора",
      description: "План в будущем или сегодня, факта договора нет.",
      tone: dist.inProgress > 0 ? "yellow" : "green",
      hover: `${dist.inProgress} в работе`,
      tooltip: kpiToolTip(
        "Ожидание заключения договора.",
        "Статус по правилу план/факт/сегодня",
        `В процессе: ${dist.inProgress}`,
        "Попадает в индекс риска с весом 0.5.",
        dist.inProgress > 3 ? "Много параллельных процессов — проверить нагрузку на юристов и ЦЗ." : "Контроль стандартный.",
        String(dist.inProgress),
        "—",
        "—",
      ),
    },
    {
      key: "ten-late",
      title: "Просрочены",
      value: String(dist.overdue),
      sub: "план < сегодня, факта нет",
      description: "Критичный статус для графика работ.",
      tone: dist.overdue > 0 ? "red" : "green",
      hover: `Просрочено: ${dist.overdue}`,
      tooltip: kpiToolTip(
        "Дата плана договора прошла, подписания нет.",
        "Фильтр по planContractDate и отсутствию factContractDate",
        `${dist.overdue} позиций`,
        "В индекс риска входит с весом 1.",
        dist.overdue > 0 ? "Нужен оперативный план на каждую позицию." : "Просрочек по этому правилу нет.",
        String(dist.overdue),
        "—",
        "—",
      ),
    },
  ];

  const enrichedTmc = tmcEnriched(tmcItems);
  const planSum = enrichedTmc.reduce((s, i) => s + i.planCost, 0);
  const factSum = enrichedTmc.reduce((s, i) => s + (i.factCost ?? 0), 0);
  const completionPct = planSum > 0 ? Math.round((factSum / planSum) * 100) : 0;
  const saving = enrichedTmc.reduce((s, i) => s + (i.planCost - (i.factCost ?? 0)), 0);
  const delays = enrichedTmc.filter((i) => (i.deviation ?? -999) > 0).length;
  const plannedOnly = enrichedTmc.filter((i) => !tmcFactReferenceDate(i)).length;
  const sampleTmc = enrichedTmc.find((i) => i.deviation !== null);

  const tmcDiagnostics: ExplainMetricDiagnostics = {
    typicalProblems: [
      "Много позиций «Не закуплено» при наступившем плане — риск простоя ГПР.",
      "Рост «Просрочек» по датам факта vs плана — срыв поставок или неверный план дат.",
      "Отрицательная экономия (перерасход) при закрытии факта выше плана.",
    ],
    whereToLook: [
      "Карточки «Выполнение», «Экономия», «Просрочки», «Не закуплено».",
      "График план/факт по стоимости и круговая диаграмма статусов.",
      "Таблица ТМЦ и связь кодов с этапами ГПР.",
    ],
    managementTakeaways: [
      "Для просрочек — еженедельный статус с поставщиком и резервные источники.",
      "Для перерасхода — пересмотр объёмов, замен и условий контрактов.",
      "Закрыть «план без факта» по датам или скорректировать план, чтобы метрика была честной.",
    ],
  };

  const tmcFormulas: ExplainFormulaDetailCard[] = [
    {
      name: "Выполнение бюджета (факт/план)",
      formula: "C = (Σ factCost) / (Σ planCost) × 100%",
      variables: [
        { symbol: "Σ fact", label: "сумма фактических затрат (null как 0)", value: `${(factSum / 1_000_000).toFixed(2)} млн` },
        { symbol: "Σ plan", label: "сумма плановых", value: `${(planSum / 1_000_000).toFixed(2)} млн` },
      ],
      calculation:
        planSum > 0
          ? `${(factSum / 1_000_000).toFixed(2)} / ${(planSum / 1_000_000).toFixed(2)} × 100% = ${completionPct}%`
          : "Плановая сумма 0 — доля не определена.",
      whyThisFormula:
        "Совпадает с карточкой «Выполнение» и линией факта на графике стоимости в презентации ТМЦ.",
      interpretation:
        completionPct >= 95
          ? "Факт почти закрыл план по деньгам — проверить своевременность в паре с датами."
          : completionPct >= 70
            ? "Значимая часть бюджета освоена; остаток требует контроля поставок."
            : "Низкое освоение — либо ранний этап, либо отставание закупок.",
    },
    {
      name: "Экономия / перерасход",
      formula: "S = Σ (planCost − factCost); factCost=null считается как 0 при суммировании факта",
      variables: [
        { symbol: "S", label: "итог", value: `${(saving / 1_000_000).toFixed(2)} млн` },
      ],
      calculation: `По ${enrichedTmc.length} поз.: сумма (план − факт) = ${(saving / 1_000_000).toFixed(2)} млн ₽`,
      whyThisFormula:
        "Та же логика, что подпись «Σ(план − факт)» на карточке презентации: положительно — экономия, отрицательно — перерасход.",
      interpretation:
        saving >= 0
          ? "Суммарно факт не выше плана — есть экономия или укладка в смету."
          : "Перерасход по совокупности позиций — разобрать крупные отклонения.",
    },
    {
      name: "Отклонение по дате (поставка)",
      formula:
        "Δ = day(fact_ref) − day(plan_ref); plan_ref = supplyPlanDate|contractPlanDate, fact_ref = contractFactDate|supplyFactDate",
      variables: sampleTmc
        ? [
            { symbol: "plan_ref", label: "опорная плановая дата", value: tmcPlanReferenceDate(sampleTmc) ?? "—" },
            { symbol: "fact_ref", label: "опорная фактическая", value: tmcFactReferenceDate(sampleTmc) ?? "—" },
          ]
        : [],
      calculation:
        sampleTmc && sampleTmc.deviation !== null
          ? `«${sampleTmc.name}»: ${sampleTmc.deviation > 0 ? "+" : ""}${sampleTmc.deviation} дн.`
          : "Нет позиции с обеими датами для примера.",
      whyThisFormula:
        "Совпадает с расчётом для статусов «светофора» ТМЦ (пороги как у ГПР: 0 / 1–14 / >14 дн.).",
      interpretation:
        sampleTmc?.deviation === undefined || sampleTmc.deviation === null
          ? "—"
          : getStatusLabel(getStatusByDeviation(sampleTmc.deviation)),
    },
  ];

  const savingTone: KpiCardTone = saving >= 0 ? "green" : "red";

  const structureSnap = computeConstructionStructureDiagnostic(tasks, tenders, tmcItems, partId);

  const structureKpis: KpiDashboardItem[] = [
    {
      key: "struct-gpr-dev",
      title: "Отклонение ГПР",
      value: `${structureSnap.avgDeviationDays > 0 ? "+" : ""}${structureSnap.avgDeviationDays} дн.`,
      sub: `${structureSnap.positiveDeviationPct}% работ с Δ > 0`,
      description: "Среднее отклонение по сроку и доля задач с положительным отклонением (симптом для разбора причин).",
      tone: toneFromDeviationDays(structureSnap.avgDeviationDays),
      hover: `Среднее: ${structureSnap.avgDeviationDays} дн., с Δ>0: ${structureSnap.positiveDeviationCount} из ${structureSnap.totalTasks}`,
      tooltip: kpiToolTip(
        "Сводка по календарю ГПР на том же списке задач, что и диагностика.",
        "avg = (1/N) Σ Δᵢ; доля_плюс = count(Δᵢ > 0) / N × 100%",
        `N = ${structureSnap.totalTasks}`,
        "Не смешивается с карточками формул базового блока ГПР — здесь только вход в сквозную диагностику.",
        structureSnap.positiveDeviationPct > 30
          ? "Значимая доля работ с отставанием — смотрите доли без тендера/ТМЦ и «чистое отставание»."
          : "Отставание по календарю умеренное или локальное.",
        String(structureSnap.positiveDeviationCount),
        String(structureSnap.totalTasks),
        `${structureSnap.positiveDeviationPct}%`,
      ),
    },
    {
      key: "struct-no-tender",
      title: "% работ без тендера",
      value: `${structureSnap.noTenderRatePct}%`,
      sub: `${structureSnap.tasksWithoutTender} из ${structureSnap.totalTasks} без договора по этапу`,
      description:
        "Задачи, по корневому этапу шифра которых в реестре части нет ни одного тендера с подписанным договором (factContractDate).",
      tone: structureSnap.noTenderRatePct > 30 ? "red" : structureSnap.noTenderRatePct > 15 ? "yellow" : "green",
      hover: `Без договора по этапу: ${structureSnap.tasksWithoutTender}`,
      tooltip: kpiToolTip(
        "Доля работ без закрытого тендера на этапе.",
        "noTenderRate = tasks_without_contractor / N × 100%",
        `${structureSnap.tasksWithoutTender} / ${structureSnap.totalTasks} = ${structureSnap.noTenderRatePct}%`,
        "Этап = первые два сегмента шифра ГПР и тендера (например 2.05).",
        structureSnap.noTenderRatePct > 25
          ? "Высокая доля — приоритет закупки услуг и дат договоров."
          : "Тендерное обеспечение этапов в основном закрыто по договору.",
        String(structureSnap.tasksWithoutTender),
        String(structureSnap.totalTasks),
        `${structureSnap.noTenderRatePct}%`,
      ),
    },
    {
      key: "struct-no-tmc",
      title: "% работ без ТМЦ",
      value: `${structureSnap.noMaterialsRatePct}%`,
      sub: `${structureSnap.tasksWithoutMaterials} без факта поставки по связям`,
      description:
        "Нет связанных ТМЦ или ни у одной связанной позиции нет фактической даты поставки (как в аналитике обеспеченности).",
      tone: structureSnap.noMaterialsRatePct > 30 ? "red" : structureSnap.noMaterialsRatePct > 15 ? "yellow" : "green",
      hover: `Без факта ТМЦ: ${structureSnap.tasksWithoutMaterials}`,
      tooltip: kpiToolTip(
        "Доля работ без подтверждённой поставки по связанным позициям.",
        "noMaterialsRate = tasks_without_materials / N × 100%",
        `${structureSnap.tasksWithoutMaterials} / ${structureSnap.totalTasks} = ${structureSnap.noMaterialsRatePct}%`,
        "Связь через relatedTmcIds задачи ГПР.",
        structureSnap.noMaterialsRatePct > 25
          ? "Высокая доля — риск снабжения и простоев фронта."
          : "Обеспеченность материалами по связям в целом прослеживается.",
        String(structureSnap.tasksWithoutMaterials),
        String(structureSnap.totalTasks),
        `${structureSnap.noMaterialsRatePct}%`,
      ),
    },
    {
      key: "struct-exec-delay",
      title: "% чистого отставания",
      value: `${structureSnap.executionDelayRatePct}%`,
      sub: `${structureSnap.delayedWithResources} работ — Δ>0 при договоре и ТМЦ`,
      description:
        "Отклонение ГПР > 0 при наличии подписанного договора по этапу и факта поставки по связанным ТМЦ — условно «исполнение», а не закупка.",
      tone:
        structureSnap.executionDelayRatePct > 20 ? "red" : structureSnap.executionDelayRatePct > 8 ? "yellow" : "green",
      hover: `Чистое отставание: ${structureSnap.delayedWithResources}`,
      tooltip: kpiToolTip(
        "Доля отставания при закрытых тендере и снабжении.",
        "executionDelayRate = delayed_tasks_with_resources / N × 100%",
        `${structureSnap.delayedWithResources} / ${structureSnap.totalTasks} = ${structureSnap.executionDelayRatePct}%`,
        "Условие ресурсов: есть factContractDate по этапу и факт по дате у хотя бы одной связанной ТМЦ.",
        structureSnap.executionDelayRatePct > 15
          ? "Значимая доля — искать причины на объекте, в организации работ и координации."
          : "Исполнение не выглядит доминирующим фактором относительно закупок.",
        String(structureSnap.delayedWithResources),
        String(structureSnap.totalTasks),
        `${structureSnap.executionDelayRatePct}%`,
      ),
    },
  ];

  const structureFormulas: ExplainFormulaDetailCard[] = [
    {
      name: "Сводка отклонения ГПР (вход в диагностику)",
      formula: "avg = (1/N) × Σ Δᵢ ; P₊ = (count(Δᵢ > 0) / N) × 100%",
      variables: [
        { symbol: "N", label: "число задач ГПР в части проекта", value: String(structureSnap.totalTasks) },
        { symbol: "Δᵢ", label: "отклонение по сроку задачи i (calculateDeviation)", value: "—" },
      ],
      calculation: `Среднее: ${structureSnap.avgDeviationDays} дн.; с Δ>0: ${structureSnap.positiveDeviationCount} → P₊ = ${structureSnap.positiveDeviationPct}%`,
      whyThisFormula:
        "Даёт масштаб симптома по календарю на том же N, по которому считаются доли без тендера/ТМЦ — без повторения пошаговой формулы одной задачи из блока ГПР.",
      interpretation:
        structureSnap.positiveDeviationPct > 35
          ? "Симптом сильный — далее сравните с noTenderRate, noMaterialsRate и executionDelayRate."
          : "Симптом умеренный; при высоких долях закупок всё равно смотрите корни.",
    },
    {
      name: "Доля работ без подписанного договора (тендер)",
      formula: "noTenderRate = (tasks_without_contractor / N) × 100%",
      variables: [
        {
          symbol: "tasks_without_contractor",
          label: "задачи без factContractDate ни у одного тендера этапа (корень шифра)",
          value: String(structureSnap.tasksWithoutTender),
        },
        { symbol: "N", label: "всего задач", value: String(structureSnap.totalTasks) },
      ],
      calculation: `${structureSnap.tasksWithoutTender} / ${structureSnap.totalTasks} × 100% = ${structureSnap.noTenderRatePct}%`,
      whyThisFormula:
        "Привязка через корневой этап шифра задачи и реестр тендеров той же части проекта — тот же принцип, что в графиках «ГПР — тендеры».",
      interpretation:
        structureSnap.noTenderRatePct > 25
          ? "Высокий % без тендера → вероятная проблема закупки услуг и сроков договоров."
          : "Доля умеренная или низкая — узкое место реже в незакрытых договорах по этапу.",
    },
    {
      name: "Доля работ без факта поставки ТМЦ",
      formula: "noMaterialsRate = (tasks_without_materials / N) × 100%",
      variables: [
        {
          symbol: "tasks_without_materials",
          label: "нет relatedTmcIds или нет фактической даты ни у одной связанной позиции",
          value: String(structureSnap.tasksWithoutMaterials),
        },
        { symbol: "N", label: "всего задач", value: String(structureSnap.totalTasks) },
      ],
      calculation: `${structureSnap.tasksWithoutMaterials} / ${structureSnap.totalTasks} × 100% = ${structureSnap.noMaterialsRatePct}%`,
      whyThisFormula:
        "Использует явные связи ГПР→ТМЦ и факт поставки по дате — согласовано с логикой обеспеченности в аналитике ТМЦ.",
      interpretation:
        structureSnap.noMaterialsRatePct > 25
          ? "Высокий % без ТМЦ → вероятная проблема снабжения и обеспечения фронта."
          : "Снабжение по связям в целом не выглядит доминирующим разрывом.",
    },
    {
      name: "Доля «чистого» отставания (исполнение)",
      formula: "executionDelayRate = (delayed_tasks_with_resources / N) × 100%",
      variables: [
        {
          symbol: "delayed_tasks_with_resources",
          label: "Δ>0 и есть договор по этапу и факт ТМЦ по связям",
          value: String(structureSnap.delayedWithResources),
        },
        { symbol: "N", label: "всего задач", value: String(structureSnap.totalTasks) },
      ],
      calculation: `${structureSnap.delayedWithResources} / ${structureSnap.totalTasks} × 100% = ${structureSnap.executionDelayRatePct}%`,
      whyThisFormula:
        "Отсечение отставаний, которые можно объяснить отсутствием договора или поставки: остаток интерпретируется как зона исполнения и организации работ.",
      interpretation:
        structureSnap.executionDelayRatePct > 15
          ? "Высокий executionDelay → после закупок смотреть производственный цикл, ресурсы бригад, погоду, согласования."
          : "При доминировании этой доли закупки менее убедительны как единственная причина.",
    },
  ];

  const structureProblems: string[] = [];
  if (structureSnap.noTenderRatePct > 25) {
    structureProblems.push(
      `Высокая доля работ без подписанного договора по этапу (${structureSnap.noTenderRatePct}%) — вероятный узел закупки услуг.`,
    );
  }
  if (structureSnap.noMaterialsRatePct > 25) {
    structureProblems.push(
      `Высокая доля работ без факта поставки ТМЦ (${structureSnap.noMaterialsRatePct}%) — риск снабжения и простоев.`,
    );
  }
  if (structureSnap.executionDelayRatePct > 15) {
    structureProblems.push(
      `Значимая доля «чистого» отставания (${structureSnap.executionDelayRatePct}%) — усилить фокус на исполнении на объекте.`,
    );
  }
  if (structureProblems.length === 0) {
    structureProblems.push(
      "По порогам (тендер >25%, ТМЦ >25%, исполнение >15%) доминирующий разрыв не выделен — держите баланс контроля по всем трём линиям.",
    );
  }

  const structureDiagnostics: ExplainMetricDiagnostics = {
    typicalProblems: structureProblems,
    whereToLook: [
      "Реестр тендеров части проекта: factContractDate по кодам этапов, совпадающим с корнем шифра задачи ГПР.",
      "ТМЦ: позиции из relatedTmcIds и наличие фактической даты поставки.",
      "Таблица/аналитика ГПР: задачи с Δ>0 при уже «зелёных» закупочных условиях по этапу.",
    ],
    managementTakeaways: [
      "Если ведёт noTenderRate — ускорить конкурсы, согласования НМЦК и подписание; синхронизировать план договоров с ГПР.",
      "Если ведёт noMaterialsRate — план отгрузок, альтернативные поставщики, резерв на объекте.",
      "Если ведёт executionDelayRate — суточное планирование, устранение потерь рабочего времени, решения по технологии и ресурсу.",
    ],
  };

  const tmcKpis: KpiDashboardItem[] = [
    {
      key: "tmc-exec",
      title: "Выполнение",
      value: `${completionPct}%`,
      sub: `${(factSum / 1_000_000).toFixed(1)} / ${(planSum / 1_000_000).toFixed(1)} млн`,
      description: "Отношение суммы факта к сумме плана по позициям среза.",
      tone: completionPct >= 90 ? "green" : completionPct >= 70 ? "yellow" : "red",
      hover: `Факт/план: ${completionPct}%`,
      tooltip: kpiToolTip(
        "Освоение бюджета ТМЦ.",
        "C = factSum / planSum × 100%",
        planSum > 0 ? `${factSum} / ${planSum}` : "—",
        "Нулевой факт трактуется как 0 в сумме.",
        "См. интерпретацию в формульной карточке.",
        `${(factSum / 1_000_000).toFixed(2)} млн`,
        `${(planSum / 1_000_000).toFixed(2)} млн`,
        `${completionPct}%`,
      ),
    },
    {
      key: "tmc-save",
      title: "Экономия / перерасход",
      value: `${saving > 0 ? "+" : ""}${(saving / 1_000_000).toFixed(1)} млн`,
      sub: "Σ(план − факт)",
      description: "Положительное значение — экономия относительно плана.",
      tone: savingTone,
      hover: `Σ(план−факт) = ${(saving / 1_000_000).toFixed(2)} млн`,
      tooltip: kpiToolTip(
        "Совокупное отклонение стоимости.",
        "S = Σ(planCost − factCost)",
        `Итог: ${(saving / 1_000_000).toFixed(2)} млн`,
        "—",
        saving >= 0 ? "Укладка в план или экономия." : "Перерасход по срезу.",
        `${(factSum / 1_000_000).toFixed(2)} млн`,
        `${(planSum / 1_000_000).toFixed(2)} млн`,
        `${(saving / 1_000_000).toFixed(2)} млн`,
      ),
    },
    {
      key: "tmc-late",
      title: "Просрочки",
      value: String(delays),
      sub: "факт позже плана",
      description: "Позиции, у которых Δ по датам > 0.",
      tone: delays > 0 ? "red" : "green",
      hover: `Δ > 0: ${delays}`,
      tooltip: kpiToolTip(
        "Срыв опорных дат поставки.",
        "count(Δ > 0)",
        `${delays} позиций`,
        "Δ из fact_ref − plan_ref.",
        delays > 0 ? "Есть отставание поставок." : "Нет позиций с положительным отклонением.",
        String(delays),
        "—",
        "—",
      ),
    },
    {
      key: "tmc-plan",
      title: "Не закуплено",
      value: String(plannedOnly),
      sub: "нет фактической даты",
      description: "Позиции без fact_ref — как на презентации.",
      tone: plannedOnly > 2 ? "yellow" : "green",
      hover: `Без факта: ${plannedOnly}`,
      tooltip: kpiToolTip(
        "Не зафиксирован факт по датам.",
        "count(fact_ref отсутствует)",
        `${plannedOnly} позиций`,
        "Может включать будущие и просроченные незакупки.",
        plannedOnly > 0 ? "Проверить ближайшие плановые даты." : "Все позиции имеют факт по датам.",
        String(plannedOnly),
        "—",
        "—",
      ),
    },
  ];

  const sections: ConstructionExplainSection[] = [
    {
      id: "gpr",
      title: "ГПР",
      description: GPR_INTRO,
      kpiItems: gprKpis,
      formulas: {
        title: "ГПР — формулы по карточкам и графику",
        formulaLines: [],
        variables: [],
        calculation: "",
        whyThisResult: "",
        formulaDetailCards: gprFormulas,
        formulaSectionFooter:
          "Пороги «в срок / риск / отставание» для отклонений совпадают с `getProjectStatus` (0; 1–14; >14 дн.).",
        diagnostics: gprDiagnostics,
        conclusion:
          "Сводка ГПР на презентации опирается на отклонение окончания и агрегаты по списку задач; при расхождениях сначала проверьте полноту дат и обновление факта.",
        formulaPanelFullWidth: true,
      },
    },
    {
      id: "structure",
      title: "Выполнение структуры строительства — диагностика",
      description: STRUCTURE_DIAGNOSTIC_INTRO,
      kpiItems: structureKpis,
      formulas: {
        title: "Сквозная диагностика: ГПР ↔ тендеры ↔ ТМЦ",
        formulaLines: [],
        variables: [],
        calculation: "",
        whyThisResult: "",
        formulaDetailCards: structureFormulas,
        formulaSectionFooter: `N = ${structureSnap.totalTasks} задач(и) ГПР в выбранной части проекта; метрики не подменяют детальные формулы отдельной задачи из блока «ГПР».`,
        diagnostics: structureDiagnostics,
        conclusion:
          "Сопоставьте три доли: без тендера, без ТМЦ и чистое отставание — доминирующая линия подскажет, где усилить управление в первую очередь.",
        formulaPanelFullWidth: true,
      },
    },
    {
      id: "tenders",
      title: "Тендеры",
      description: TENDERS_INTRO,
      kpiItems: tenderKpis,
      formulas: {
        title: "Тендеры — формулы по карточкам и кривым",
        formulaLines: [],
        variables: [],
        calculation: "",
        whyThisResult: "",
        formulaDetailCards: tenderFormulas,
        formulaSectionFooter:
          "Накопленные проценты на графике «План vs Факт» считаются как накопительное число позиций с датой не позже выбранного месяца, делённое на N_total.",
        diagnostics: tenderDiagnostics,
        conclusion:
          "Тендерный срез связан с ГПР через коды этапов: отставание договора почти всегда требует пересборки ближайших работ.",
        formulaPanelFullWidth: true,
      },
    },
    {
      id: "tmc",
      title: "ТМЦ",
      description: TMC_INTRO,
      kpiItems: tmcKpis,
      formulas: {
        title: "ТМЦ — формулы по карточкам и графикам стоимости",
        formulaLines: [],
        variables: [],
        calculation: "",
        whyThisResult: "",
        formulaDetailCards: tmcFormulas,
        formulaSectionFooter: "На линейном графике в презентации по оси Y — planCost и factCost по каждой позиции (не нормированные доли).",
        diagnostics: tmcDiagnostics,
        conclusion:
          "ТМЦ закрывает стоимость и сроки поставок; согласуйте красные статусы с красными этапами ГПР по тем же шифрам.",
        formulaPanelFullWidth: true,
      },
    },
  ];

  return { partName, sections };
}
