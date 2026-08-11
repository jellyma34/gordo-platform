"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";
import {
  accumulatePlanFactMonthlyRows,
  TmcPlanFactTodayReferenceLine,
  type TmcPlanFactValueMode,
} from "@/components/tmc/TmcPlanFactTodayReferenceLine";
import type { TmcRequestMonthlyDynamicsRow } from "@/lib/tmcRequestDynamicsAnalytics";

export type { TmcPlanFactValueMode };

const COLORS = {
  plan: "#94a3b8",
  fact: "#22c55e",
  card: "#1e293b",
} as const;

function formatCountLabel(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "0";
}

function formatDeviation(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function requestsWord(n: number): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return "заявок";
  if (mod10 === 1) return "заявка";
  if (mod10 >= 2 && mod10 <= 4) return "заявки";
  return "заявок";
}

function PlanFactTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TmcRequestMonthlyDynamicsRow }>;
  mode: TmcPlanFactValueMode;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const deviation = row.fact - row.plan;
  const planLabel = mode === "cumulative" ? "План накопительно" : "План";
  const factLabel = mode === "cumulative" ? "Факт накопительно" : "Факт";

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="mb-1.5 font-semibold text-slate-100">Месяц: {row.monthTitle}</div>
      <div className="tabular-nums text-slate-300">
        {planLabel}:{" "}
        <span className="font-medium text-white">
          {row.plan} {requestsWord(row.plan)}
        </span>
      </div>
      <div className="tabular-nums text-slate-300">
        {factLabel}:{" "}
        <span className="font-medium text-white">
          {row.fact} {requestsWord(row.fact)}
        </span>
      </div>
      <div className="tabular-nums text-slate-300">
        Отклонение:{" "}
        <span
          className={`font-medium ${deviation < 0 ? "text-rose-400" : deviation > 0 ? "text-emerald-400" : "text-white"}`}
        >
          {formatDeviation(deviation)}
        </span>
      </div>
    </div>
  );
}

export function TmcRequestMonthlyDynamicsChart({
  rows,
  reportDate = new Date(),
  mode = "monthly",
}: {
  rows: TmcRequestMonthlyDynamicsRow[];
  reportDate?: Date;
  mode?: TmcPlanFactValueMode;
}) {
  const chartRows = useMemo(
    () => (mode === "cumulative" ? accumulatePlanFactMonthlyRows(rows) : rows),
    [rows, mode],
  );

  if (chartRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Недостаточно дат заявок для построения динамики
      </div>
    );
  }

  const maxCount = chartRows.reduce((m, r) => Math.max(m, r.plan, r.fact), 0);

  return (
    <div className="h-full w-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows} margin={{ top: 18, right: 8, left: 4, bottom: 36 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            type="category"
            scale="point"
            interval={0}
            height={40}
            tick={{
              fill: "#94a3b8",
              fontSize: 10,
              angle: -90,
              textAnchor: "end",
            }}
            axisLine={{ stroke: "rgba(148,163,184,0.25)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(maxCount + 1, 4)]}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{
              value: "Количество заявок",
              angle: -90,
              position: "insideLeft",
              offset: 0,
              style: { fill: "#64748b", fontSize: 9 },
            }}
          />
          <Tooltip
            content={<PlanFactTooltip mode={mode} />}
            cursor={{ stroke: "rgba(148,163,184,0.25)" }}
          />
          <TmcPlanFactTodayReferenceLine rows={chartRows} reportDate={reportDate} />
          <Line
            type="monotone"
            dataKey="plan"
            name="План"
            stroke={COLORS.plan}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 3, fill: COLORS.plan, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="plan"
              position="top"
              fill="#94a3b8"
              fontSize={9}
              fontWeight={600}
              formatter={formatCountLabel}
            />
          </Line>
          <Line
            type="monotone"
            dataKey="fact"
            name="Факт"
            stroke={COLORS.fact}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.fact, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="fact"
              position="top"
              fill="#22c55e"
              fontSize={10}
              fontWeight={600}
              formatter={formatCountLabel}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
