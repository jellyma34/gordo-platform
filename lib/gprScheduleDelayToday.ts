import type { GPRTask } from "@/lib/gprUtils";
import { toDate } from "@/lib/gprUtils";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Окно «риска» по календарю: окончание факта в ближайшие N дней от сегодня (включительно). */
export const FACT_END_RISK_WINDOW_DAYS = 14;

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
 * @deprecated Для цвета полосы «Факт» на Ганте используйте {@link factColorForFactEndVsToday}.
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

/**
 * Статус по календарю: дата окончания факта относительно сегодня.
 * — Нет факта → серый
 * — factEnd &lt; сегодня → отставание (красный): факт по датам не дошёл до текущего дня
 * — factEnd ≥ сегодня и до сегодня+14 дней включительно → риск (жёлтый)
 * — Иначе → в срок (зелёный)
 */
export function trafficLightFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now: Date = new Date(),
): FactEndVsTodayTraffic {
  if (!factStartIso?.trim() || !factEndIso?.trim()) return "gray";
  const fe = toDate(factEndIso);
  if (!fe) return "gray";
  const td = startOfLocalDayMs(now.getTime());
  const feDay = startOfLocalDayMs(fe.getTime());
  if (feDay < td) return "red";
  const diffDays = Math.round((feDay - td) / MS_PER_DAY);
  if (diffDays >= 0 && diffDays <= FACT_END_RISK_WINDOW_DAYS) return "yellow";
  return "green";
}

export function factColorForFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now?: Date,
): string {
  const t = trafficLightFactEndVsToday(factStartIso, factEndIso, now);
  if (t === "gray") return "rgba(148, 163, 184, 0.5)";
  if (t === "red") return "#ef4444";
  if (t === "yellow") return "#f59e0b";
  return "#22c55e";
}

export function statusLabelForFactEndVsToday(
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
  now?: Date,
): "нет данных" | "отставание" | "риск" | "в срок" {
  const t = trafficLightFactEndVsToday(factStartIso, factEndIso, now);
  if (t === "gray") return "нет данных";
  if (t === "red") return "отставание";
  if (t === "yellow") return "риск";
  return "в срок";
}

/** @deprecated Используйте {@link factColorForFactEndVsToday}. */
export function factColorForScheduleDelayToday(delay: number | null): string {
  if (delay === null) return "rgba(148, 163, 184, 0.5)";
  if (delay <= 0) return "#22c55e";
  if (delay <= 14) return "#f59e0b";
  return "#ef4444";
}

/** @deprecated Используйте {@link statusLabelForFactEndVsToday}. */
export function statusLabelForScheduleDelayToday(
  delay: number | null,
): "нет данных" | "в срок" | "риск" | "отставание" {
  if (delay === null) return "нет данных";
  if (delay <= 0) return "в срок";
  if (delay <= 14) return "риск";
  return "отставание";
}

/** Цвет полосы факта на Ганте: по дате окончания факта относительно сегодня. */
export function ganttFactColorForScheduleToday(
  task: Pick<GPRTask, "factStart" | "factEnd">,
  now?: Date,
): string {
  return factColorForFactEndVsToday(task.factStart, task.factEnd, now);
}
