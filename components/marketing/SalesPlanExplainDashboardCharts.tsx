"use client";

import type { CSSProperties } from "react";

import type { SalesPlanRootCauseExplainSnapshot, SalesPlanStructureBalanceDiagnostic } from "@/lib/buildSalesPlanPresentationExplain";
import { compactRub, structureBalanceBarLabelLine } from "@/lib/salesPlanChartFormat";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

const axisColor = "#94a3b8";
const gridColor = "rgba(148,163,184,0.12)";
const dec1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type ConvRow = { name: string; factConv: number; planConv: number; factPlanLabel: string; fill: string };

export function SalesPlanExplainStructureBalance({
  diagnostic,
  chartTitle = "Баланс структуры продаж",
  chartLead = "Ширина бара от центра пропорциональна |Δ доли|; подпись на баре — Δ доли и Δ ₽ по сегменту. Сортировка по модулю денежного эффекта.",
}: {
  diagnostic: SalesPlanStructureBalanceDiagnostic;
  /** Заголовок карточки (например, для отдельной секции explain). */
  chartTitle?: string;
  /** Краткая подсказка под заголовком. */
  chartLead?: string;
}) {
  const { rows, maxDelta, axisMaxPp, scaleTicks } = diagnostic;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200/85">{chartTitle}</div>
      <p className="mb-3 max-w-xl text-[10px] leading-snug text-slate-500">{chartLead}</p>
      <ul className="space-y-2.5">
        <li className="hidden md:grid md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] md:gap-2 md:items-end">
          <div aria-hidden className="min-h-[1px]" />
          <div className="relative h-6 w-full text-slate-400">
            {scaleTicks.map((v) => {
              const leftPct = 50 + (v / axisMaxPp) * 50;
              return (
                <div
                  key={`scale-${v}`}
                  className="pointer-events-none absolute bottom-0 flex flex-col items-center"
                  style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
                >
                  <div className={v === 0 ? "h-5 w-[2px] bg-slate-100" : "h-3 w-px bg-slate-500/[0.06]"} />
                  <span className="mt-0.5 text-[9px] font-medium tabular-nums leading-none">
                    {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </li>
        {rows.map((row) => {
          const barWPct = Math.min(50, (Math.abs(row.deltaShare) / maxDelta) * 50);
          const labelLine = structureBalanceBarLabelLine(row.deltaShare, row.deltaRub);
          const amberBar = (row.deltaShare < 0 && row.deltaRub >= 0) || (row.deltaShare > 0 && row.deltaRub <= 0);
          const labelPillBase =
            "max-w-[min(100%,11rem)] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none";
          const labelPillStyle: CSSProperties = amberBar
            ? { backgroundColor: "rgba(255,255,255,0.92)" }
            : { backgroundColor: "rgba(0,0,0,0.45)" };
          const labelTextClass = amberBar ? "text-slate-900" : "text-white";
          const negGrad =
            row.deltaShare < 0
              ? "linear-gradient(90deg, #ffe4e6 0%, #fca5a5 52%, #e11d48 100%)"
              : "linear-gradient(90deg, #fffbeb 0%, #fcd34d 48%, #ca8a04 100%)";
          const posGrad =
            row.deltaShare > 0
              ? row.deltaRub > 0
                ? "linear-gradient(90deg, #0f766e 0%, #14b8a6 45%, #5eead4 100%)"
                : "linear-gradient(90deg, #b45309 0%, #eab308 48%, #fde047 100%)"
              : "";
          const trackPx = Math.min(50, Math.round(13 + row.impactNorm * 24));
          const labelOutside = barWPct < 12 && barWPct > 0;

          return (
            <li key={row.key} className="rounded-lg border border-slate-700/40 bg-slate-950/25 px-2 py-2 sm:py-1.5">
              <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] md:gap-2">
                <div className="text-xs font-bold tracking-tight text-slate-50">{row.label}</div>
                <div className="flex min-w-0 items-center" style={{ minHeight: trackPx }}>
                  <div
                    className="relative w-full overflow-hidden rounded-md"
                    style={{ height: trackPx, backgroundColor: "rgba(255,255,255,0.06)" }}
                  >
                    {scaleTicks.map((v) => {
                      const leftPct = 50 + (v / axisMaxPp) * 50;
                      const isZero = v === 0;
                      return (
                        <div
                          key={`${row.key}-tick-${v}`}
                          className={`pointer-events-none absolute bottom-0 top-0 z-[1] -translate-x-1/2 ${
                            isZero ? "w-[2px] bg-slate-100" : "w-px bg-slate-400/[0.06]"
                          }`}
                          style={{ left: `${leftPct}%` }}
                          aria-hidden
                        />
                      );
                    })}
                    {row.deltaShare < 0 ? (
                      <>
                        <div
                          className="absolute bottom-0 top-0 z-[5] overflow-hidden rounded-l-sm border-l-2 border-l-slate-100"
                          style={{ right: "50%", width: `${barWPct}%`, background: negGrad }}
                        >
                          {!labelOutside ? (
                            <div className="relative z-[7] flex h-full items-center justify-end pr-1">
                              <span className={labelPillBase} style={labelPillStyle}>
                                <span className={labelTextClass}>{labelLine}</span>
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {labelOutside ? (
                          <div
                            className="pointer-events-none absolute z-[8] flex items-center"
                            style={{
                              left: `calc(50% - ${barWPct}% - 6px)`,
                              top: "50%",
                              transform: "translate(-100%, -50%)",
                            }}
                          >
                            <span className={labelPillBase} style={labelPillStyle}>
                              <span className={labelTextClass}>{labelLine}</span>
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {row.deltaShare > 0 ? (
                      <>
                        <div
                          className="absolute bottom-0 top-0 z-[5] overflow-hidden rounded-r-sm border-r-2 border-r-slate-100"
                          style={{ left: "50%", width: `${barWPct}%`, background: posGrad }}
                        >
                          {!labelOutside ? (
                            <div className="relative z-[7] flex h-full items-center justify-start pl-1">
                              <span className={labelPillBase} style={labelPillStyle}>
                                <span className={labelTextClass}>{labelLine}</span>
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {labelOutside ? (
                          <div
                            className="pointer-events-none absolute z-[8] flex items-center"
                            style={{
                              left: `calc(50% + ${barWPct}% + 6px)`,
                              top: "50%",
                              transform: "translateY(-50%)",
                            }}
                          >
                            <span className={labelPillBase} style={labelPillStyle}>
                              <span className={labelTextClass}>{labelLine}</span>
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SalesPlanExplainRootCauseWaterfall({ snapshot }: { snapshot: SalesPlanRootCauseExplainSnapshot }) {
  const { waterfallRows, wfMin, wfSpan } = snapshot;
  return (
    <div className="rounded-xl border border-emerald-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Водопад драйверов</div>
      <p className="mb-2 text-[10px] leading-snug text-slate-500">Тот же расчёт шагов и масштабирования, что на слайде презентации.</p>
      <div className="relative mx-auto mt-2 h-44 w-full max-w-xl">
        <div className="relative flex h-40 items-stretch justify-between gap-1 px-0.5">
          {waterfallRows.map((r) => {
            const lo = Math.min(r.runningStart, r.runningEnd);
            const hi = Math.max(r.runningStart, r.runningEnd);
            const bottomPct = ((lo - wfMin) / wfSpan) * 100;
            const heightPct = ((hi - lo) / wfSpan) * 100;
            return (
              <div key={r.id} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                <div className="relative w-[78%] flex-1">
                  <div
                    className={`absolute left-0 right-0 rounded-t ${r.impactRub < 0 ? "bg-rose-500/90" : "bg-emerald-500/85"}`}
                    style={{
                      bottom: `${bottomPct}%`,
                      height: `${Math.max(heightPct, 1.2)}%`,
                    }}
                  />
                </div>
                <div className="mt-1 line-clamp-2 text-center text-[8px] font-medium leading-tight text-slate-400">{r.labelRu}</div>
                <div
                  className={`text-[9px] font-bold tabular-nums ${r.impactRub < 0 ? "text-rose-200" : "text-emerald-200"}`}
                >
                  {r.impactRub >= 0 ? "+" : "−"}
                  {compactRub(Math.abs(r.impactRub))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SalesPlanExplainUpsellConvChart({ rows, yMax }: { rows: ConvRow[]; yMax: number }) {
  const domainMax = Math.max(60, Math.ceil(yMax));
  return (
    <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200/85">Конверсия upsell (план vs факт)</div>
      <div className="h-[168px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }} barGap={8} barCategoryGap="40%">
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="factPlanLabel" tick={{ fill: axisColor, fontSize: 10 }} axisLine={{ stroke: gridColor }} tickLine={false} interval={0} />
            <YAxis
              tick={{ fill: axisColor, fontSize: 9 }}
              axisLine={false}
              width={36}
              domain={[0, domainMax]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }}
              formatter={(v) => [`${dec1.format(Number(v))}%`, ""]}
              contentStyle={{ fontSize: 10, borderRadius: 6, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
            />
            <Bar dataKey="planConv" name="План, %" barSize={48} fill="rgba(148,163,184,0.2)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="factConv" name="Факт, %" barSize={24} radius={[4, 4, 0, 0]}>
              {rows.map((row, idx) => (
                <Cell key={`upsell-conv-explain-${row.name}-${idx}`} fill={row.fill || "#FF4D4F"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
