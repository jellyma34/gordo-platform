import type { Chart, TooltipModel } from "chart.js";
import type { GprTmcCompletionScatterTooltipDetail } from "./gprTmcDependency";
import { formatGprWorkCodeAndTitle } from "./gprTmcDependency";

const TOOLTIP_ELEMENT_ID = "gpr-tmc-completion-scatter-tooltip";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTooltipPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

function buildTooltipHtml(detail: GprTmcCompletionScatterTooltipDetail): string {
  const rows: string[] = [
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:148px;flex-shrink:0;">Этап:</span><span style="color:#f1f5f9;font-weight:600;">${escapeHtml(detail.stageLabel)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:148px;flex-shrink:0;">Статус:</span><span style="color:#e2e8f0;">${escapeHtml(detail.statusLabel)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:148px;flex-shrink:0;">Обеспеченность ТМЦ:</span><span style="color:#e2e8f0;">${formatTooltipPercent(detail.tmcPercent)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:148px;flex-shrink:0;">Выполнение ГПР:</span><span style="color:#e2e8f0;">${formatTooltipPercent(detail.gprPercent)}</span></div>`,
  ];

  if (detail.childWorks.length > 0) {
    rows.push(
      `<div style="border-top:1px solid rgba(148,163,184,0.25);margin:10px 0 8px;"></div>`,
      `<div style="color:#cbd5e1;font-weight:600;margin-bottom:6px;">Состав этапа:</div>`,
      `<ul style="margin:0;padding-left:18px;color:#e2e8f0;">${detail.childWorks
        .map(
          (work) =>
            `<li style="margin:2px 0;">${escapeHtml(formatGprWorkCodeAndTitle(work.code, work.name))}</li>`,
        )
        .join("")}</ul>`,
    );
  }

  rows.push(
    `<div style="border-top:1px solid rgba(148,163,184,0.25);margin:10px 0 8px;"></div>`,
    `<div style="color:#cbd5e1;font-weight:600;margin-bottom:6px;">ТМЦ этапа:</div>`,
  );

  if (detail.tmcLines.length === 0) {
    rows.push(`<div style="color:#94a3b8;">Нет данных по обеспеченности ТМЦ</div>`);
  } else {
    rows.push(
      `<ul style="margin:0;padding-left:18px;color:#e2e8f0;">${detail.tmcLines
        .map(
          (line) =>
            `<li style="margin:2px 0;">${escapeHtml(line.name)} — ${line.supplyPercent}%</li>`,
        )
        .join("")}</ul>`,
    );
  }

  return rows.join("");
}

function applyTooltipElementStyles(el: HTMLDivElement): void {
  el.style.position = "absolute";
  el.style.pointerEvents = "auto";
  el.style.zIndex = "40";
  el.style.transition = "opacity 0.12s ease";
  el.style.background = "rgba(15, 23, 42, 0.97)";
  el.style.border = "1px solid rgba(148, 163, 184, 0.35)";
  el.style.borderRadius = "12px";
  el.style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.45)";
  el.style.padding = "12px 14px";
  el.style.minWidth = "320px";
  el.style.maxWidth = "min(480px, calc(100vw - 24px))";
  el.style.width = "max-content";
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  el.style.overflowY = "visible";
  el.style.font = "500 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif";
}

function getOrCreateTooltipElement(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ELEMENT_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = TOOLTIP_ELEMENT_ID;
    document.body.appendChild(el);
  }
  applyTooltipElementStyles(el);
  return el;
}

/** Внешний tooltip Chart.js для scatter «% выполнения». */
export function gprTmcCompletionScatterExternalTooltip(
  context: { chart: Chart; tooltip: TooltipModel<"line"> },
  getDetail: (index: number) => GprTmcCompletionScatterTooltipDetail | undefined,
): void {
  const tooltipEl = getOrCreateTooltipElement();
  const { chart, tooltip } = context;

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    tooltipEl.style.pointerEvents = "none";
    return;
  }

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index == null) {
    tooltipEl.style.opacity = "0";
    tooltipEl.style.pointerEvents = "none";
    return;
  }

  const detail = getDetail(index);
  if (!detail) {
    tooltipEl.style.opacity = "0";
    tooltipEl.style.pointerEvents = "none";
    return;
  }

  tooltipEl.innerHTML = buildTooltipHtml(detail);
  tooltipEl.style.pointerEvents = "auto";

  const position = chart.canvas.getBoundingClientRect();
  let left = position.left + window.scrollX + tooltip.caretX + 12;
  let top = position.top + window.scrollY + tooltip.caretY - 12;

  tooltipEl.style.opacity = "1";
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;

  const rect = tooltipEl.getBoundingClientRect();
  const viewportPad = 8;
  if (rect.right > window.innerWidth - viewportPad) {
    left -= rect.right - (window.innerWidth - viewportPad);
    tooltipEl.style.left = `${left}px`;
  }
  if (rect.bottom > window.innerHeight - viewportPad) {
    top -= rect.bottom - (window.innerHeight - viewportPad);
    tooltipEl.style.top = `${top}px`;
  }
  if (rect.left < viewportPad) {
    left += viewportPad - rect.left;
    tooltipEl.style.left = `${left}px`;
  }
  if (rect.top < viewportPad) {
    top += viewportPad - rect.top;
    tooltipEl.style.top = `${top}px`;
  }
}
