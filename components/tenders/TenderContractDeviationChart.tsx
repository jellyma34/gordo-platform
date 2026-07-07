"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  card: "#1e293b",
} as const;

export type ContractDeviationChartPoint = {
  id: string;
  code: string;
  name: string;
  planIso: string;
  factIso: string;
  deviation: number;
};

type ChartRow = ContractDeviationChartPoint & {
  label: string;
  /** Инверсия отклонения: опережение вверх, отставание вниз. */
  chartValue: number;
};

function deviationZoneColor(d: number): string {
  if (d === 0) return COLORS.gray;
  if (d < 0) return COLORS.green;
  if (d <= 14) return COLORS.yellow;
  return COLORS.red;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatRuDateDDMMYYYY(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("ru-RU");
}

function daysWordRu(n: number): string {
  const abs = Math.abs(Math.round(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  const last = abs % 10;
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function formatDaysSignedRu(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return `0 ${daysWordRu(0)}`;
  const abs = Math.abs(rounded);
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${abs} ${daysWordRu(abs)}`;
}

function contractDeviationDisplayLabel(code: string, name: string): string {
  const c = code.trim();
  if (c) return c;
  const n = name.trim();
  if (!n) return "—";
  if (n.length <= 14) return n;
  return `${n.slice(0, 12)}…`;
}

function computeChartYDomain(items: ContractDeviationChartPoint[]): [number, number] {
  let maxAbs = 0;
  for (const item of items) {
    maxAbs = Math.max(maxAbs, Math.abs(item.deviation));
  }
  const limit = Math.max(1, Math.ceil(maxAbs * 1.1));
  return [-limit, limit];
}

function formatDeviationAxisTick(chartY: number): string {
  const dev = -Math.round(Number(chartY));
  return `${dev} дн.`;
}

function ContractDeviationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const color = deviationZoneColor(row.deviation);
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        background: COLORS.card,
        borderColor: "rgba(148,163,184,0.35)",
        color: "#e2e8f0",
      }}
    >
      <div className="font-semibold text-slate-100">
        Код тендера:{" "}
        <span className="font-medium text-white">{row.code.trim() || "—"}</span>
      </div>
      <div className="mt-0.5 max-w-[260px] text-slate-300">{row.name || "—"}</div>
      <div className="mt-2 tabular-nums text-slate-300">
        Плановая дата:{" "}
        <span className="font-medium text-white">{formatRuDateDDMMYYYY(row.planIso)}</span>
      </div>
      <div className="tabular-nums text-slate-300">
        Фактическая дата:{" "}
        <span className="font-medium text-white">{formatRuDateDDMMYYYY(row.factIso)}</span>
      </div>
      <div className="mt-1 tabular-nums" style={{ color }}>
        Отклонение (дней):{" "}
        <span className="font-semibold">{formatDaysSignedRu(row.deviation)}</span>
      </div>
    </div>
  );
}

export function TenderContractDeviationChart({
  items,
}: {
  items: ContractDeviationChartPoint[];
}) {
  const rows = useMemo<ChartRow[]>(
    () =>
      items.map((item) => ({
        ...item,
        label: contractDeviationDisplayLabel(item.code, item.name),
        chartValue: -item.deviation,
      })),
    [items],
  );

  const yDomain = useMemo(() => computeChartYDomain(items), [items]);

  const barCategoryGap = items.length > 40 ? "8%" : items.length > 20 ? "12%" : "18%";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        margin={{ top: 12, right: 12, left: 2, bottom: 4 }}
        barCategoryGap={barCategoryGap}
      >
        <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="label"
          interval={0}
          height={56}
          tick={{
            fill: "#94a3b8",
            fontSize: 9,
            angle: -90,
            textAnchor: "end",
          }}
        />
        <YAxis
          domain={yDomain}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={formatDeviationAxisTick}
          allowDecimals={false}
          width={56}
        />
        <ReferenceLine
          y={0}
          stroke="rgba(148,163,184,0.55)"
          strokeDasharray="4 4"
          label={{
            value: "0 дней",
            fill: "#94a3b8",
            fontSize: 10,
            position: "right",
          }}
        />
        <Tooltip content={<ContractDeviationTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Bar dataKey="chartValue" maxBarSize={28} minPointSize={3} radius={[3, 3, 3, 3]}>
          {rows.map((row) => (
            <Cell key={row.id} fill={deviationZoneColor(row.deviation)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
