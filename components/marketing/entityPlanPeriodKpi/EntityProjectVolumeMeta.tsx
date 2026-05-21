"use client";

import { formatCompactCurrencyRuParts } from "@/lib/formatCompactCurrencyRu";
import { dec2Fmt, formatRuNumber, numFmt } from "@/lib/salesPlanChartFormat";

type IntegerVolumeProps = {
  mode?: "integer";
  count: number;
  unit: string;
  caption?: string;
  railMinWidthPx?: number;
  /** Узкий левый rail (колонка + border-r). */
  compact?: boolean;
  /** Строка под заголовком комнатности (без border-r). */
  inlineHeader?: boolean;
  presDark: boolean;
  presentation: boolean;
};

type DecimalVolumeProps = {
  mode: "decimal";
  value: number;
  unit: string;
  caption?: string;
  fractionDigits?: number;
  railMinWidthPx?: number;
  presDark: boolean;
  presentation: boolean;
};

type CompactCurrencyVolumeProps = {
  mode: "compact-currency";
  rub: number;
  caption?: string;
  railMinWidthPx?: number;
  presDark: boolean;
  presentation: boolean;
};

type Props = IntegerVolumeProps | DecimalVolumeProps | CompactCurrencyVolumeProps;

/** Компактная meta-метка объёма проекта слева от KPI cards (mobile: над сеткой). */
export function EntityProjectVolumeMeta(props: Props) {
  const { caption, presDark, presentation } = props;
  const compact = props.mode !== "decimal" && props.mode !== "compact-currency" && props.compact;
  const inlineHeader = props.mode !== "decimal" && props.mode !== "compact-currency" && props.inlineHeader;
  const railMinWidthPx =
    props.railMinWidthPx ??
    (props.mode === "decimal" || props.mode === "compact-currency" ? 120 : compact ? 56 : undefined);

  let displayMain: string | null = null;
  let displayUnit = "unit" in props ? props.unit : "";
  if (props.mode === "compact-currency") {
    const rub = props.rub;
    if (!Number.isFinite(rub) || rub <= 0) return null;
    const parts = formatCompactCurrencyRuParts(rub);
    if (parts.value === "—") return null;
    displayMain = parts.value;
    displayUnit = "unit" in parts ? parts.unit : "₽";
  } else if (props.mode === "decimal") {
    const v = props.value;
    if (!Number.isFinite(v) || v <= 0) return null;
    const digits = props.fractionDigits ?? 2;
    displayMain = digits === 2 ? dec2Fmt.format(v) : formatRuNumber(v, digits);
  } else {
    const safeCount = Number.isFinite(props.count) && props.count > 0 ? Math.round(props.count) : null;
    if (safeCount == null) return null;
    displayMain = numFmt.format(safeCount);
  }

  const colorCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";
  const borderCls = presDark ? "border-white/10" : "border-slate-200/55";
  const railStyle = railMinWidthPx ? { minWidth: railMinWidthPx } : undefined;
  const mdMaxW =
    props.mode === "decimal" || props.mode === "compact-currency"
      ? "md:max-w-none"
      : inlineHeader
        ? "max-w-none"
        : compact
          ? "max-w-[4.5rem]"
          : "md:max-w-[5rem]";

  const layoutCls = inlineHeader
    ? "flex flex-row items-baseline gap-1.5 self-start"
    : compact
      ? "flex flex-col items-center justify-center gap-0.5 self-stretch border-r py-1 pe-3"
      : props.mode === "decimal" || props.mode === "compact-currency"
        ? "flex flex-col items-center justify-center gap-1 self-center pb-1 md:self-stretch md:border-r md:py-2 md:pb-0 md:pe-5"
        : "flex flex-row items-baseline justify-center gap-1.5 self-center pb-1 md:flex-col md:items-center md:justify-center md:gap-1 md:self-stretch md:border-r md:py-2 md:pb-0 md:pe-5";

  return (
    <aside
      className={`shrink-0 ${layoutCls} ${mdMaxW} ${inlineHeader ? "" : borderCls}`}
      style={railStyle}
      aria-label={
        caption
          ? `${caption}: ${displayMain} ${displayUnit}`
          : `Всего в проекте: ${displayMain} ${displayUnit}`
      }
    >
      {caption ? (
        <span
          className={`text-center uppercase leading-tight tracking-wide ${colorCls}`}
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}
        >
          {caption}
        </span>
      ) : null}
      <span
        className={`tabular-nums leading-none tracking-tight ${colorCls}`}
        style={{
          fontSize: compact ? 15 : props.mode === "decimal" || props.mode === "compact-currency" ? 16 : 18,
          fontWeight: 700,
        }}
      >
        {displayMain}
      </span>
      <span
        className={`whitespace-nowrap leading-tight ${colorCls}`}
        style={{
          fontSize: compact ? 11 : props.mode === "decimal" || props.mode === "compact-currency" ? 12 : 13,
          fontWeight: 600,
        }}
      >
        {displayUnit}
      </span>
    </aside>
  );
}
