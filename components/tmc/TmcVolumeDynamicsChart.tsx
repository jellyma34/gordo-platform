"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnalyticsLegendItem, AnalyticsLegendList } from "@/components/construction/AnalyticsLegendItem";
import type { TmcVolumeDynamicsRow } from "@/lib/tmcPresentationAnalytics";

const COLORS = {
  remaining: "#f59e0b",
} as const;

const AXIS_TICKS = [0, 25, 50, 75, 100] as const;

const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 8;
const TOOLTIP_Z_INDEX = 250;

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function fmtQtyWithUnit(n: number, unit: string): string {
  const formatted = fmtQty(n);
  if (formatted === "—") return formatted;
  return unit && unit !== "—" ? `${formatted} ${unit}` : formatted;
}

function formatRemainingPercentBarLabel(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function formatRemainingPercentTooltip(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function gprStageTooltipLabel(text: string): string {
  return text.replace(/^•\s*/, "- ");
}

function formatGprWorkGroupStageCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} этап`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} этапа`;
  return `${count} этапов`;
}

function computeFloatingTooltipPosition(
  anchor: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchor.left;
  let top = anchor.bottom + TOOLTIP_GAP;

  if (left + tooltipWidth > vw - TOOLTIP_MARGIN) {
    left = Math.max(TOOLTIP_MARGIN, anchor.right - tooltipWidth);
  }
  if (left < TOOLTIP_MARGIN) left = TOOLTIP_MARGIN;

  if (top + tooltipHeight > vh - TOOLTIP_MARGIN) {
    top = anchor.top - tooltipHeight - TOOLTIP_GAP;
  }
  if (top < TOOLTIP_MARGIN) {
    top = Math.max(TOOLTIP_MARGIN, Math.min(anchor.top, vh - tooltipHeight - TOOLTIP_MARGIN));
  }

  return { top, left };
}

function TmcVolumeDynamicsTooltipContent({ row }: { row: TmcVolumeDynamicsRow }) {
  const stageLines = row.gprStageTooltipLines.map((line) => gprStageTooltipLabel(line.text));

  return (
    <>
      <div className="font-semibold text-slate-100">{row.name}</div>
      <div className="mt-2 space-y-1 tabular-nums text-slate-300">
        <div>План: {fmtQtyWithUnit(row.plannedQty, row.unit)}</div>
        <div>Закуплено: {fmtQtyWithUnit(row.purchasedQty, row.unit)}</div>
        <div>Осталось: {fmtQtyWithUnit(row.remainingQty, row.unit)}</div>
        <div>Осталось докупить: {formatRemainingPercentTooltip(row.remainingPercent)}</div>
      </div>
      <div className="mt-2 text-slate-300">
        <div className="font-medium text-slate-200">Связанные этапы:</div>
        <ul className="mt-1 space-y-0.5">
          {stageLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

function TmcVolumeDynamicsFloatingTooltip({
  row,
  anchorRect,
  anchorEl,
}: {
  row: TmcVolumeDynamicsRow;
  anchorRect: DOMRect;
  anchorEl: HTMLElement;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ top: anchorRect.bottom + TOOLTIP_GAP, left: anchorRect.left }));

  const reposition = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const tooltipRect = el.getBoundingClientRect();
    const anchor = anchorEl.getBoundingClientRect();
    setPos(computeFloatingTooltipPosition(anchor, tooltipRect.width, tooltipRect.height));
  }, [anchorEl]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition, row, anchorRect]);

  useEffect(() => {
    const onViewportChange = () => reposition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [reposition]);

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      className="tmc-volume-dynamics-chart__tooltip pointer-events-none fixed z-[250] w-[min(320px,calc(100vw-24px))] rounded-lg border border-slate-600/50 bg-[#1e293b] px-3 py-2.5 text-xs shadow-lg"
      style={{ top: pos.top, left: pos.left, zIndex: TOOLTIP_Z_INDEX }}
    >
      <TmcVolumeDynamicsTooltipContent row={row} />
    </div>,
    document.body,
  );
}

type ActiveTooltip = {
  row: TmcVolumeDynamicsRow;
  anchorRect: DOMRect;
  anchorEl: HTMLElement;
};

export function TmcVolumeDynamicsChart({
  rows,
  allProcured = false,
}: {
  rows: TmcVolumeDynamicsRow[];
  allProcured?: boolean;
}) {
  const [portalMounted, setPortalMounted] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chartHeight = useMemo(() => {
    return Math.min(900, Math.max(320, rows.length * 96 + 72));
  }, [rows.length]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const showTooltip = useCallback((row: TmcVolumeDynamicsRow, target: HTMLElement) => {
    setActiveTooltip({
      row,
      anchorRect: target.getBoundingClientRect(),
      anchorEl: target,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setActiveTooltip(null);
  }, []);

  const handleRowMouseEnter = useCallback(
    (row: TmcVolumeDynamicsRow, event: MouseEvent<HTMLDivElement>) => {
      showTooltip(row, event.currentTarget);
    },
    [showTooltip],
  );

  const handleRowFocus = useCallback(
    (row: TmcVolumeDynamicsRow, event: FocusEvent<HTMLDivElement>) => {
      showTooltip(row, event.currentTarget);
    },
    [showTooltip],
  );

  const handleRowBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        hideTooltip();
      }
    },
    [hideTooltip],
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center px-6 text-center text-sm text-slate-400">
        {allProcured
          ? "Все позиции ТМЦ обеспечены закупками"
          : "Нет данных для построения графика закупок"}
      </div>
    );
  }

  return (
    <div className="tmc-volume-dynamics-chart w-full min-w-0">
      <div
        ref={scrollRef}
        className="tmc-volume-dynamics-chart__scroll min-h-[320px] w-full overflow-y-auto overflow-x-hidden"
        style={{ height: chartHeight }}
        onScroll={hideTooltip}
      >
        <div className="tmc-volume-dynamics-chart__rows flex min-w-0 flex-col pr-1">
          {rows.map((row) => (
            <div
              key={row.name}
              className="tmc-volume-dynamics-chart__row group relative flex min-w-0 items-center gap-2 border-b border-slate-700/25 py-3 sm:gap-3"
              tabIndex={0}
              onMouseEnter={(event) => handleRowMouseEnter(row, event)}
              onMouseLeave={hideTooltip}
              onFocus={(event) => handleRowFocus(row, event)}
              onBlur={handleRowBlur}
            >
              <div className="tmc-volume-dynamics-chart__labels w-[min(280px,46%)] min-w-0 shrink-0 sm:w-[min(300px,42%)]">
                <p className="tmc-volume-dynamics-chart__material-name break-words text-xs font-bold leading-snug text-slate-100 [overflow-wrap:anywhere]">
                  {row.name}
                </p>

                {row.gprWorkGroups.length === 0 ? (
                  <p className="tmc-volume-dynamics-chart__work-undefined mt-1.5 pl-1 text-[10px] leading-snug text-slate-500">
                    Этап не определён
                  </p>
                ) : (
                  <div className="tmc-volume-dynamics-chart__work-groups mt-1.5 space-y-1.5 pl-1">
                    {row.gprWorkGroups.map((group) => (
                      <div key={group.groupCode} className="tmc-volume-dynamics-chart__work-group">
                        <p className="tmc-volume-dynamics-chart__work-title break-words text-[11px] leading-snug text-slate-300">
                          {group.workTitle}
                        </p>
                        <p className="tmc-volume-dynamics-chart__work-meta text-[10px] leading-snug text-slate-500">
                          {group.groupCode} ({formatGprWorkGroupStageCount(group.stageCount)})
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="tmc-volume-dynamics-chart__bar-area flex min-w-0 flex-1 items-center gap-2">
                <div className="tmc-volume-dynamics-chart__bar-track relative h-[18px] min-w-0 flex-1 rounded bg-slate-800/35">
                  <div
                    className="tmc-volume-dynamics-chart__bar h-full rounded bg-[#f59e0b]"
                    style={{ width: `${Math.min(100, Math.max(0, row.remainingPercent))}%` }}
                  />
                </div>
                <span className="tmc-volume-dynamics-chart__percent w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-100">
                  {formatRemainingPercentBarLabel(row.remainingPercent)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="tmc-volume-dynamics-chart__axis mt-3 border-t border-slate-700/30 pt-2">
          <div className="tmc-volume-dynamics-chart__axis-track ml-[min(280px,46%)] flex min-w-0 items-center gap-2 sm:ml-[min(300px,42%)]">
            <div className="tmc-volume-dynamics-chart__axis-scale relative mr-10 h-4 min-w-0 flex-1">
              {AXIS_TICKS.map((tick) => (
                <span
                  key={tick}
                  className="tmc-volume-dynamics-chart__axis-tick absolute -translate-x-1/2 text-[10px] tabular-nums text-slate-500"
                  style={{ left: `${tick}%` }}
                >
                  {tick}%
                </span>
              ))}
            </div>
          </div>
          <p className="tmc-volume-dynamics-chart__axis-title ml-[min(280px,46%)] mt-1 text-[11px] text-slate-500 sm:ml-[min(300px,42%)]">
            Процент незакрытой потребности
          </p>
        </div>
      </div>

      {portalMounted && activeTooltip ? (
        <TmcVolumeDynamicsFloatingTooltip
          row={activeTooltip.row}
          anchorRect={activeTooltip.anchorRect}
          anchorEl={activeTooltip.anchorEl}
        />
      ) : null}

      <div className="mt-3 border-t border-slate-700/40 pt-3">
        <AnalyticsLegendList>
          <AnalyticsLegendItem
            markerColor={COLORS.remaining}
            label="Процент незакрытой потребности"
          />
        </AnalyticsLegendList>
      </div>
    </div>
  );
}
