"use client";

import { CalendarDays, ChevronDown } from "lucide-react";

/** Режимы отчётного периода — для будущего подключения логики. */
export type HubReportingPeriodMode = "month" | "quarter" | "custom";

export type HubReportingPeriodMonthValue = {
  mode: "month";
  monthKey: string;
};

export type HubReportingPeriodQuarterValue = {
  mode: "quarter";
  quarterKey: string;
};

export type HubReportingPeriodCustomValue = {
  mode: "custom";
  from: string;
  to: string;
};

export type HubReportingPeriodValue =
  | HubReportingPeriodMonthValue
  | HubReportingPeriodQuarterValue
  | HubReportingPeriodCustomValue;

/** Пропсы для будущего интерактивного селектора (пока не используются). */
export type HubReportingPeriodSelectorProps = {
  value?: HubReportingPeriodValue | null;
  onChange?: (value: HubReportingPeriodValue) => void;
  disabled?: boolean;
};

const PERIOD_MODES: readonly HubReportingPeriodMode[] = ["month", "quarter", "custom"];

/**
 * Визуальная заглушка выбора отчётного периода на главном экране презентации.
 * Меню и состояние будут подключены позже.
 */
export function HubReportingPeriodSelector(_props: HubReportingPeriodSelectorProps = {}) {
  return (
    <div className="presentation-period-wrap">
      <button
        type="button"
        className="presentation-period-selector"
        data-reporting-period-selector
        data-period-modes={PERIOD_MODES.join(",")}
        aria-haspopup="listbox"
        aria-expanded={false}
        aria-label="Выберите отчетный период"
      >
        <span className="presentation-period-selector-label">Выберите отчетный период</span>
        <span className="presentation-period-selector-icons" aria-hidden>
          <CalendarDays className="presentation-period-selector-calendar" strokeWidth={1.75} />
          <ChevronDown className="presentation-period-selector-chevron" strokeWidth={2} />
        </span>
      </button>
    </div>
  );
}
