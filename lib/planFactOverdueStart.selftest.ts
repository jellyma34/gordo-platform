import {
  computePlanFactOverdueStartOverlaySpanPct,
  planFactGprBarSpanPct,
  type PlanFactWorkTypeChartModel,
} from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function baseModel(overrides: Partial<PlanFactWorkTypeChartModel> = {}): PlanFactWorkTypeChartModel {
  return {
    labels: ["2.05.06 — Test"],
    planRanges: [[0, 6]],
    factRanges: [null],
    planColors: ["rgba(148, 163, 184, 0.5)"],
    factColors: ["rgba(148, 163, 184, 0.25)"],
    factCompletionLabels: ["0%"],
    rowDetails: [
      {
        planStart: "2025-01-01",
        planEnd: "2025-07-01",
        factStart: null,
        factEnd: null,
        hasDates: true,
      },
    ],
    originMonth: new Date(2025, 0, 1),
    xMin: 0,
    xMax: 8,
    todayX: 3.5,
    ...overrides,
  };
}

// Середина апреля, факт 0% — частичная подсветка от старта до today.
const partial = computePlanFactOverdueStartOverlaySpanPct(baseModel(), 0);
assert(partial != null, "partial overdue overlay");
assert(partial!.leftPct >= 0, "overlay starts within chart");
assert(partial!.widthPct > 0 && partial!.widthPct < 80, "partial overlay not full bar");

// Пустая подпись факта (как у resolvePlanFactChartRowFactLabel для не начатых) — overlay есть.
assert(
  computePlanFactOverdueStartOverlaySpanPct(
    baseModel({ factCompletionLabels: [""] }),
    0,
  ) != null,
  "overlay when fact label empty and no fact dates",
);

// Фактические даты без подписи % — работа начата, без подсветки.
assert(
  computePlanFactOverdueStartOverlaySpanPct(
    baseModel({
      factCompletionLabels: [""],
      rowDetails: [
        {
          planStart: "2025-01-01",
          planEnd: "2025-07-01",
          factStart: "2025-02-01",
          factEnd: null,
          hasDates: true,
        },
      ],
    }),
    0,
  ) === null,
  "no overlay when fact dates exist",
);

// Факт > 0 — без подсветки.
assert(
  computePlanFactOverdueStartOverlaySpanPct(
    baseModel({ factCompletionLabels: ["12%"] }),
    0,
  ) === null,
  "no overlay when fact started",
);

// Today до plannedStart — без подсветки.
assert(
  computePlanFactOverdueStartOverlaySpanPct(
    baseModel({
      todayX: 1.5,
      rowDetails: [
        {
          planStart: "2025-03-01",
          planEnd: "2025-07-01",
          factStart: null,
          factEnd: null,
          hasDates: true,
        },
      ],
    }),
    0,
  ) === null,
  "no overlay before planned start",
);

// Today после plannedFinish, факт 0% — вся плановая полоса.
const fullModel = baseModel({ todayX: 10 });
const full = computePlanFactOverdueStartOverlaySpanPct(fullModel, 0);
assert(full != null, "full overdue overlay");
const planSpan = planFactGprBarSpanPct(fullModel.planRanges[0], fullModel.xMin, fullModel.xMax);
assert(planSpan != null, "plan span");
assert(Math.abs(full!.leftPct - planSpan!.leftPct) < 0.5, "full overlay left matches plan");
assert(Math.abs(full!.widthPct - planSpan!.widthPct) < 0.5, "full overlay width matches plan");

// Режим «Упрощённо» — без подсветки.
assert(
  computePlanFactOverdueStartOverlaySpanPct(
    baseModel({ percentScaleMode: true, todayX: null }),
    0,
  ) === null,
  "no overlay in percent scale mode",
);

console.log("[planFactOverdueStart.selftest] OK");
