import type { Chart, TooltipModel } from "chart.js";
import type { GprTenderCompletionScatterTooltipDetail } from "./gprTmcDependency";

const TOOLTIP_ELEMENT_ID = "gpr-tender-completion-scatter-tooltip";

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

function buildTooltipHtml(detail: GprTenderCompletionScatterTooltipDetail): string {
  const rows: string[] = [
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:168px;">Этап:</span><span style="color:#f1f5f9;font-weight:600;">${escapeHtml(detail.stageShort)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:168px;">Название этапа:</span><span style="color:#e2e8f0;">${escapeHtml(detail.stageTitle)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:168px;">Завершено тендеров:</span><span style="color:#e2e8f0;">${detail.tenderCompleted} из ${detail.tenderTotal}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:168px;">Процент тендеров:</span><span style="color:#e2e8f0;">${formatTooltipPercent(detail.tenderPercent)}</span></div>`,
    `<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:#94a3b8;min-width:168px;">Выполнение ГПР:</span><span style="color:#e2e8f0;">${formatTooltipPercent(detail.gprPercent)}</span></div>`,
  ];

  return rows.join("");
}

function getOrCreateTooltipElement(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ELEMENT_ID) as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = TOOLTIP_ELEMENT_ID;
  el.style.position = "absolute";
  el.style.pointerEvents = "none";
  el.style.zIndex = "40";
  el.style.opacity = "0";
  el.style.transition = "opacity 0.12s ease";
  el.style.background = "rgba(15, 23, 42, 0.97)";
  el.style.border = "1px solid rgba(148, 163, 184, 0.35)";
  el.style.borderRadius = "12px";
  el.style.boxShadow = "0 12px 32px rgba(15, 23, 42, 0.45)";
  el.style.padding = "12px 14px";
  el.style.minWidth = "300px";
  el.style.maxWidth = "420px";
  el.style.font = "500 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif";
  document.body.appendChild(el);
  return el;
}

/** Внешний tooltip Chart.js для scatter «% выполнения» (ГПР — тендеры). */
export function gprTenderCompletionScatterExternalTooltip(
  context: { chart: Chart; tooltip: TooltipModel<"line"> },
  getDetail: (index: number) => GprTenderCompletionScatterTooltipDetail | undefined,
): void {
  const tooltipEl = getOrCreateTooltipElement();
  const { chart, tooltip } = context;

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = "0";
    return;
  }

  const index = tooltip.dataPoints[0]?.dataIndex;
  if (index == null) {
    tooltipEl.style.opacity = "0";
    return;
  }

  const detail = getDetail(index);
  if (!detail) {
    tooltipEl.style.opacity = "0";
    return;
  }

  tooltipEl.innerHTML = buildTooltipHtml(detail);

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
