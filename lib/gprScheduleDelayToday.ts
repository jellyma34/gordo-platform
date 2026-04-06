import type { GPRTask } from "@/lib/gprUtils";
import { toDate } from "@/lib/gprUtils";

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

export function factColorForScheduleDelayToday(delay: number | null): string {
  if (delay === null) return "rgba(148, 163, 184, 0.5)";
  if (delay <= 0) return "#22c55e";
  if (delay <= 14) return "#f59e0b";
  return "#ef4444";
}

export function statusLabelForScheduleDelayToday(
  delay: number | null,
): "нет данных" | "в срок" | "риск" | "отставание" {
  if (delay === null) return "нет данных";
  if (delay <= 0) return "в срок";
  if (delay <= 14) return "риск";
  return "отставание";
}

/** Цвет полосы факта на Ганте: по отставанию графика на сегодня (одна логика для всех режимов). */
export function ganttFactColorForScheduleToday(
  task: Pick<GPRTask, "planStart" | "planEnd" | "factStart" | "factEnd">,
  now?: Date,
): string {
  return factColorForScheduleDelayToday(
    scheduleDelayTodayDays(
      task.planStart,
      task.planEnd,
      task.factStart,
      task.factEnd,
      now,
    ),
  );
}
