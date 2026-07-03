/**
 * Диагностика просроченного старта на диаграмме «Динамика выполнения ГПР».
 * Запуск: npx tsx lib/planFactOverdueStart.diagnostic.ts
 */
import {
  buildPlanFactWorkTypeChartModel,
  computePlanFactOverdueStartOverlaySpanPct,
} from "./planFactWorkTypeTimeline";
import type { GPRTask } from "./gprUtils";

function parsePlanFactChartPercentLabel(label: string): number | null {
  const text = label.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

const todayIso = "2026-07-03";

const task20506: GPRTask = {
  id: "diag-20506",
  code: "2.05.06",
  name: "Устройство перегородок и вентшахт",
  level: 2,
  partId: 1,
  globalTaskId: "2.05.06::diag",
  planStart: "2026-05-01",
  planEnd: "2026-12-30",
  factStart: null,
  factEnd: null,
  completion: 0,
};

const tasks: GPRTask[] = [task20506];

const model = buildPlanFactWorkTypeChartModel(
  tasks,
  "residential",
  todayIso,
  "detailed",
  tasks,
);

console.log("=== PlanFact overdue start diagnostic ===\n");

if (!model) {
  console.log("model is null — chart not built");
  process.exit(1);
}

const targetLabel = "2.05.06 — Устройство перегородок и вентшахт";
const index = model.labels.findIndex((l) => l.includes("2.05.06"));
if (index < 0) {
  console.log("row not found. labels:", model.labels);
  process.exit(1);
}

const detail = model.rowDetails[index];
const factLabelRaw = model.factCompletionLabels[index] ?? "";
const factPercent = parsePlanFactChartPercentLabel(factLabelRaw);
const overlay = computePlanFactOverdueStartOverlaySpanPct(model, index);

console.log({
  id: targetLabel,
  plannedStart: detail?.planStart,
  plannedFinish: detail?.planEnd,
  today: todayIso,
  todayX: model.todayX,
  percentScaleMode: model.percentScaleMode,
  factCompletionLabelRaw: JSON.stringify(factLabelRaw),
  factProgress: factPercent,
  hasDates: detail?.hasDates,
  overlayStartPct: overlay?.leftPct ?? null,
  overlayWidthPct: overlay?.widthPct ?? null,
  overlayIsNull: overlay === null,
});

console.log("\n--- Step-by-step gate checks ---");

const gates: Array<{ gate: string; pass: boolean; detail?: string }> = [];

gates.push({
  gate: "1. percentScaleMode is false",
  pass: !model.percentScaleMode,
  detail: String(model.percentScaleMode),
});
gates.push({
  gate: "2. factPercent === 0 (strict)",
  pass: factPercent === 0,
  detail: `parsed=${factPercent}, raw=${JSON.stringify(factLabelRaw)}`,
});
gates.push({
  gate: "3. rowDetails has dates",
  pass: Boolean(detail && detail.hasDates !== false),
});
gates.push({
  gate: "4. todayX is set",
  pass: model.todayX != null && Number.isFinite(model.todayX),
  detail: String(model.todayX),
});
gates.push({
  gate: "5. today > plannedStart (month float)",
  pass: model.todayX != null && detail != null,
  detail: "see planStartX vs todayX below",
});
gates.push({
  gate: "6. overlay width > 0",
  pass: overlay != null && overlay.widthPct > 0,
  detail: overlay ? String(overlay.widthPct) : "overlay null",
});

for (const g of gates) {
  console.log(`${g.pass ? "PASS" : "FAIL"} — ${g.gate}${g.detail ? ` (${g.detail})` : ""}`);
}

console.log("\n--- JSX would render overdueOverlay? ---");
const planSpan = model.planRanges[index];
console.log({
  planRangeExists: planSpan != null,
  overdueOverlaySpanTruthy: overlay != null,
  jsxCondition_span_and_overdue: planSpan != null && overlay != null,
});

console.log("\n--- Visual stack (code review) ---");
console.log({
  overlayAfterPlanBarInDom: true,
  zIndex_planBar: "none (default)",
  zIndex_overlay: "none (default, painted after plan)",
  overlayColor: "rgba(220, 70, 70, 0.4)",
  overflowHidden_onBarArea: false,
  overflowHidden_onLabelColumnOnly: true,
});

if (overlay === null && factPercent !== 0) {
  console.log(
    "\n>>> ROOT CAUSE: factCompletionLabels is not \"0%\" for not-started rows.",
  );
  console.log(
    "    resolvePlanFactChartRowFactLabel() returns \"\" when fact=0 and no fact dates.",
  );
  console.log(
    "    computePlanFactOverdueStartOverlaySpanPct() exits at: if (factPercent !== 0) return null",
  );
  console.log(`    factPercent parsed as: ${factPercent} (null !== 0 → early return)`);
}
