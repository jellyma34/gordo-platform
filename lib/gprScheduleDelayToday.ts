import type { GPRTask } from "@/lib/gprUtils";
import { calculateDeviation, planFactEndDeviationDays, toDate } from "@/lib/gprUtils";
import { getProjectStatus } from "@/utils/status";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfLocalDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Число календарных дней [start, end] включительно (оба конца — локальная полуночь). */
function inclusiveCalendarDays(startMs: number, endMs: number): number {
  const s = startOfLocalDayMs(startMs);
  const e = startOfLocalDayMs(endMs);
  if (e < s) return 0;
  return Math.round((e - s) / MS_PER_DAY) + 1;
}

/**
 * Отставание графика на сегодня (в плановых днях длительности):
 * (доля пройденного плана − доля пройденного факта) × длительность плана.
 * Положительное — факт отстаёт от линейного ожидания плана на текущую дату.
 * @deprecated Для цвета полосы «Факт» на Ганте используйте {@link factColorForPlanFactEnd}.
 */
export function scheduleDelayTodayDays(
  planStartIso: string,
  planEndIso: string,
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const ps = toDate(planStartIso);
  const pe = toDate(planEndIso);
  if (!ps || !pe || ps > pe) return null;

  const planStartMs = ps.getTime();
  const planEndMs = pe.getTime();
  const todayMs = startOfLocalDayMs(now.getTime());

  const dPlan = inclusiveCalendarDays(planStartMs, planEndMs);
  if (dPlan <= 0) return null;

  let elapsedPlan = 0;
  if (todayMs >= planStartMs) {
    const capMs = Math.min(todayMs, planEndMs);
    elapsedPlan = inclusiveCalendarDays(planStartMs, capMs);
  }
  const planProgress = Math.min(1, elapsedPlan / dPlan);

  if (!factStartIso?.trim()) return null;
  const fs = toDate(factStartIso);
  if (!fs) return null;
  const fe = factEndIso?.trim() ? toDate(factEndIso) : null;
  if (fe && fe < fs) return null;

  const fsMs = fs.getTime();
  const feMs = fe?.getTime() ?? todayMs;

  const dFact = fe ? inclusiveCalendarDays(fsMs, feMs) : dPlan;
  const denomFact = Math.max(dFact, 1);

  let elapsedFact = 0;
  if (todayMs >= fsMs) {
    const capMs = Math.min(todayMs, feMs);
    elapsedFact = inclusiveCalendarDays(fsMs, capMs);
  }
  const factProgress = Math.min(1, elapsedFact / denomFact);

  const delayToday = (planProgress - factProgress) * dPlan;
  return Math.round(delayToday);
}

export type FactEndVsTodayTraffic = "gray" | "red" | "yellow" | "green";

function trafficLightFromPlanFactDeviation(deviationDays: number | null): FactEndVsTodayTraffic {
  if (deviationDays === null) return "gray";
  const s = getProjectStatus(deviationDays);
  if (s === "success") return "green";
  if (s === "warning") return "yellow";
  return "red";
}

/**
 * Светофор по отклонению окончания: fact_end − plan_end (дни).
 * Пороги: ≤0 в срок, 1…14 риск, &gt;14 отставание. Без дат факта/плана — серый.
 */
export function trafficLightPlanVsFactEnd(
  planEndIso: string | null | undefined,
  factEndIso: string | null | undefined,
): FactEndVsTodayTraffic {
  return trafficLightFromPlanFactDeviation(planFactEndDeviationDays(planEndIso, factEndIso));
}

export function factColorForPlanFactEnd(
  planEndIso: string | null | undefined,
  factEndIso: string | null | undefined,
): string {
  const t = trafficLightPlanVsFactEnd(planEndIso, factEndIso);
  if (t === "gray") return "rgba(148, 163, 184, 0.5)";
  if (t === "red") return "#ef4444";
  if (t === "yellow") return "#f59e0b";
  return "#22c55e";
}

export function statusLabelForPlanFactEnd(
  planEndIso: string | null | undefined,
  factEndIso: string | null | undefined,
): "нет данных" | "отставание" | "риск" | "в срок" {
  const t = trafficLightPlanVsFactEnd(planEndIso, factEndIso);
  if (t === "gray") return "нет данных";
  if (t === "red") return "отставание";
  if (t === "yellow") return "риск";
  return "в срок";
}

/**
 * @deprecated Сравнение окончания факта с «сегодня» для статуса ГПР не используется; см. {@link trafficLightPlanVsFactEnd}.
 */
export function trafficLightFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now: Date = new Date(),
): FactEndVsTodayTraffic {
  void factStartIso;
  void factEndIso;
  void now;
  return "gray";
}

/** @deprecated Используйте {@link factColorForPlanFactEnd} с planEnd и factEnd. */
export function factColorForFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now?: Date,
): string {
  void factStartIso;
  void now;
  if (!factEndIso?.trim()) return "rgba(148, 163, 184, 0.5)";
  return "rgba(148, 163, 184, 0.5)";
}

/** @deprecated Используйте {@link statusLabelForPlanFactEnd}. */
export function statusLabelForFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now?: Date,
): "нет данных" | "отставание" | "риск" | "в срок" {
  void factStartIso;
  void now;
  if (!factEndIso?.trim()) return "нет данных";
  return "нет данных";
}

/** @deprecated Используйте {@link factColorForPlanFactEnd}. */
export function factColorForScheduleDelayToday(delay: number | null): string {
  if (delay === null) return "rgba(148, 163, 184, 0.5)";
  if (delay <= 0) return "#22c55e";
  if (delay <= 14) return "#f59e0b";
  return "#ef4444";
}

/** @deprecated Используйте {@link statusLabelForPlanFactEnd}. */
export function statusLabelForScheduleDelayToday(
  delay: number | null,
): "нет данных" | "в срок" | "риск" | "отставание" {
  if (delay === null) return "нет данных";
  if (delay <= 0) return "в срок";
  if (delay <= 14) return "риск";
  return "отставание";
}

/** Цвет полосы «Факт» на Ганте: по актуальной логике статуса задачи. */
export function ganttFactColorForScheduleToday(
  task: Pick<GPRTask, "planStart" | "planEnd" | "factStart" | "factEnd">,
  now: Date = new Date(),
): string {
  const deviation = calculateDeviation(
    {
      id: "0",
      globalTaskId: "0",
      code: "0",
      name: "tmp",
      partId: 1,
      planStart: task.planStart,
      planEnd: task.planEnd,
      factStart: task.factStart,
      factEnd: task.factEnd,
      completion: 0,
    },
    now,
  );
  const t = trafficLightFromPlanFactDeviation(deviation);
  if (t === "gray") return "rgba(148, 163, 184, 0.5)";
  if (t === "red") return "#ef4444";
  if (t === "yellow") return "#f59e0b";
  return "#22c55e";
}
