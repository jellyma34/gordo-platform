import { toLocalYmd } from "@/lib/gprReportDate";
import {
  daysBetween,
  formatGprScheduleDeviationDisplayDays,
  gprTaskScheduleDeviationDisplayDays,
  planFactEndDeviationDays,
  toDate,
  type GPRTask,
} from "@/lib/gprUtils";
import { tmcFactReferenceDate, tmcPlanReferenceDate, type TMCItem } from "@/lib/tmcData";

export type GprTaskExecutionPhase = "not_started" | "in_progress" | "completed" | "suspended";

export type GprScheduleDeviationBadge = {
  icon: string;
  label: string;
  className: string;
};

export type GprScheduleDeviationInsight = {
  phase: GprTaskExecutionPhase;
  badge: GprScheduleDeviationBadge;
  planRangeInline: string;
  factRangeInline: string;
  planStartLabel: string;
  planEndLabel: string;
  factStartLabel: string;
  factEndLabel: string;
  deviationHeading: string;
  deviationLabel: string;
  reasonLines: string[];
};

function russianDaysWordAbs(n: number): string {
  const a = Math.abs(Math.round(n));
  const mod10 = a % 10;
  const mod100 = a % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function formatSignedManagementDays(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return "0 дней";
  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);
  const num = Number.isInteger(abs) ? String(Math.round(abs)) : abs.toFixed(1).replace(".", ",");
  return `${sign}${num} ${russianDaysWordAbs(abs)}`;
}

function conclusionMetricColor(value: number | null): string {
  if (value === null || value === 0) return "#94a3b8";
  if (value > 0) return "#ef4444";
  return "#22c55e";
}

export function formatGprStageDurationDays(days: number | null): string {
  if (days == null) return "—";
  return `${days} дн.`;
}

export function formatGprStageDeviationDisplay(durationDeviation: number | null): string {
  if (durationDeviation == null) return "—";
  const rounded = Math.round(durationDeviation * 10) / 10;
  if (rounded === 0) return "0 дн.";
  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);
  const num = Number.isInteger(abs) ? String(Math.round(abs)) : abs.toFixed(1).replace(".", ",");
  return `${sign}${num} дн.`;
}

export type GprStageDurationMetric = {
  label: string;
  value: string;
  color: string;
};

/** Числовой показатель перерасхода/экономии для правой колонки карточки этапа. */
export function resolveGprStageDurationMetric(
  durationDeviation: number | null,
): GprStageDurationMetric | null {
  if (durationDeviation == null || durationDeviation === 0) return null;
  return {
    label: durationDeviation > 0 ? "Перерасход" : "Экономия",
    value: formatGprStageDeviationDisplay(durationDeviation),
    color: conclusionMetricColor(durationDeviation),
  };
}

const EXECUTION_BADGE: Record<GprTaskExecutionPhase, GprScheduleDeviationBadge> = {
  completed: {
    icon: "✓",
    label: "Завершено",
    className:
      "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/35",
  },
  in_progress: {
    icon: "◉",
    label: "В работе",
    className:
      "inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300 ring-1 ring-sky-500/35",
  },
  not_started: {
    icon: "○",
    label: "Не начато",
    className:
      "inline-flex items-center gap-1 rounded-md bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-500/35",
  },
  suspended: {
    icon: "⏸",
    label: "Приостановлено",
    className:
      "inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/35",
  },
};

export function formatGprTaskCalendarDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPlanDateRange(
  planStart: string | null | undefined,
  planEnd: string | null | undefined,
): string {
  const start = formatGprTaskCalendarDate(planStart);
  const end = formatGprTaskCalendarDate(planEnd);
  if (start === "—" && end === "—") return "—";
  if (start === "—") return end;
  if (end === "—") return start;
  return `${start} – ${end}`;
}

function formatFactDateRangeInline(
  phase: GprTaskExecutionPhase,
  factStart: string | null | undefined,
  factEnd: string | null | undefined,
): string {
  if (phase === "not_started") return "—";
  if (phase === "completed") return formatPlanDateRange(factStart, factEnd);
  const start = formatGprTaskCalendarDate(factStart);
  if (start === "—") return "—";
  return `${start} – по н.в.`;
}

function formatDelayMagnitudeDays(n: number): string {
  const r = Math.round(Math.abs(n));
  return `+${r} дн.`;
}

export function isGprTaskBlockedByTmc(task: GPRTask, tmcItems: TMCItem[], asOf: Date): boolean {
  const tmcById = new Map(tmcItems.map((x) => [x.id, x]));
  const todayMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  for (const tmcId of task.relatedTmcIds ?? []) {
    const item = tmcById.get(tmcId);
    if (!item) continue;
    const planRef = tmcPlanReferenceDate(item);
    const factRef = tmcFactReferenceDate(item);
    const planMs = planRef ? new Date(`${planRef}T00:00:00`).getTime() : NaN;
    const factMs = factRef ? new Date(`${factRef}T00:00:00`).getTime() : null;
    const notPurchasedOverdue = !factRef && Number.isFinite(planMs) && planMs < todayMs;
    const overdue = factMs !== null && Number.isFinite(planMs) && factMs > planMs;
    if (notPurchasedOverdue || overdue) return true;
  }
  return false;
}

function isSuspendedHint(task: GPRTask, blockedByTmc: boolean): boolean {
  if (blockedByTmc) return true;
  return /приостанов/i.test(String(task.comment ?? ""));
}

function resolveExecutionPhase(task: GPRTask, blockedByTmc: boolean): GprTaskExecutionPhase {
  const completion = Number(task.completion) || 0;
  if (task.factEnd?.trim() || completion >= 100) return "completed";
  const suspended = isSuspendedHint(task, blockedByTmc);
  if (task.factStart?.trim()) {
    return suspended ? "suspended" : "in_progress";
  }
  if (suspended) return "suspended";
  return "not_started";
}

function deviationHeading(phase: GprTaskExecutionPhase): string {
  if (phase === "completed") return "Итоговое отклонение";
  if (phase === "not_started") return "Отклонение старта";
  return "Текущее отклонение";
}

function factEndTooltipLabel(
  phase: GprTaskExecutionPhase,
  factEnd: string | null | undefined,
): string {
  if (factEnd?.trim()) return formatGprTaskCalendarDate(factEnd);
  if (phase === "in_progress" || phase === "suspended") return "по н.в.";
  return "—";
}

function factStartTooltipLabel(
  phase: GprTaskExecutionPhase,
  factStart: string | null | undefined,
): string {
  if (factStart?.trim()) return formatGprTaskCalendarDate(factStart);
  if (phase === "not_started") return "не начато";
  return "—";
}

/** Разложение отставания по сроку: поздний старт и/или увеличенная длительность (дни, + = отставание). */
function buildReasonLines(
  phase: GprTaskExecutionPhase,
  endDelay: number | null,
  startLagDays: number | null,
  factStart: string | null | undefined,
): string[] {
  if (endDelay === null && startLagDays === null) return [];

  const lines: string[] = [];

  if (phase === "not_started") {
    if (startLagDays != null && startLagDays > 0) {
      lines.push(`Поздний выход на работы (${formatDelayMagnitudeDays(startLagDays)})`);
    }
    return lines;
  }

  if (phase === "suspended") {
    lines.push("Работа приостановлена — возможное влияние на сроки");
  }

  const lateStart = startLagDays != null && startLagDays > 0;
  const durationExt =
    endDelay !== null && factStart?.trim() ? endDelay - (startLagDays ?? 0) : null;
  const longDuration = durationExt != null && durationExt > 0;

  if (lateStart && longDuration) {
    lines.push(`Поздний выход: ${formatDelayMagnitudeDays(startLagDays!)}`);
    lines.push(`Увеличенная длительность: ${formatDelayMagnitudeDays(durationExt!)}`);
    if (endDelay != null && endDelay > 0) {
      lines.push(`Совокупное отклонение: ${formatDelayMagnitudeDays(endDelay)}`);
    }
    return lines;
  }

  if (lateStart) {
    lines.push(`Поздний выход на работы (${formatDelayMagnitudeDays(startLagDays!)})`);
    return lines;
  }

  if (longDuration) {
    lines.push(`Увеличенная длительность выполнения (${formatDelayMagnitudeDays(durationExt!)})`);
    return lines;
  }

  if (endDelay != null && endDelay < 0) {
    lines.push(`Завершена раньше плана (${formatGprScheduleDeviationDisplayDays(-endDelay)})`);
    return lines;
  }

  if (endDelay != null && endDelay > 0) {
    lines.push(`Отставание по сроку окончания (${formatDelayMagnitudeDays(endDelay)})`);
  }

  return lines;
}

export function buildGprScheduleDeviationInsight(
  task: GPRTask,
  asOf: Date = new Date(),
  opts?: { tmcItems?: TMCItem[] },
): GprScheduleDeviationInsight {
  const tmcItems = opts?.tmcItems ?? [];
  const blockedByTmc = isGprTaskBlockedByTmc(task, tmcItems, asOf);
  const phase = resolveExecutionPhase(task, blockedByTmc);
  const asOfIso = toLocalYmd(asOf);

  let startLagDays: number | null = null;
  if (task.planStart?.trim()) {
    if (task.factStart?.trim()) {
      const lag = daysBetween(task.planStart, task.factStart);
      startLagDays = Number.isFinite(lag) ? lag : null;
    } else if (phase === "not_started") {
      const lag = daysBetween(task.planStart, asOfIso);
      startLagDays = Number.isFinite(lag) && lag > 0 ? lag : null;
    }
  }

  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  const displayDeviation = gprTaskScheduleDeviationDisplayDays(task, asOf);

  let deviationLabel = "—";
  if (phase === "not_started") {
    if (startLagDays != null && startLagDays > 0) {
      deviationLabel = formatDelayMagnitudeDays(startLagDays);
    }
  } else if (displayDeviation !== null) {
    deviationLabel = formatGprScheduleDeviationDisplayDays(displayDeviation);
  }

  return {
    phase,
    badge: EXECUTION_BADGE[phase],
    planRangeInline: formatPlanDateRange(task.planStart, task.planEnd),
    factRangeInline: formatFactDateRangeInline(phase, task.factStart, task.factEnd),
    planStartLabel: formatGprTaskCalendarDate(task.planStart),
    planEndLabel: formatGprTaskCalendarDate(task.planEnd),
    factStartLabel: factStartTooltipLabel(phase, task.factStart),
    factEndLabel: factEndTooltipLabel(phase, task.factEnd),
    deviationHeading: deviationHeading(phase),
    deviationLabel,
    reasonLines: buildReasonLines(phase, endDelay, startLagDays, task.factStart),
  };
}
