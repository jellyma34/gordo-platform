"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  buildTenderStageInsight,
  compareGprStageCodes,
  contractDeviationDays,
  getGprStageFromTenderCode,
  mergeTenderSnapshotWithSeed,
  readTenderSnapshotFromStorage,
  TENDER_STAGE_CHART_LABEL,
  tenderTrafficFromContract,
  tenderTrafficLabel,
  type Tender,
  type TenderTraffic,
} from "@/lib/tenderData";
import { PROJECT_PARTS } from "@/lib/gprUtils";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), {
  ssr: false,
});
const PieChart = dynamic(() => import("recharts").then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  card: "#1e293b",
} as const;

type DrillKey = "total" | "green" | "yellow" | "red";

type TenderGprInfluenceRow = {
  stage: string;
  label: string;
  onTime: number;
  risk: number;
  delayed: number;
  examples: string[];
};

function TenderGprInfluenceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TenderGprInfluenceRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div
      className="max-w-xs rounded-lg border border-slate-500/50 bg-[#1e293b] p-3 text-xs shadow-xl"
      style={{ maxWidth: "min(20rem, calc(100vw - 2rem))" }}
    >
      <div className="font-semibold text-slate-100">Этап {row.stage}</div>
      <div className="mt-2 space-y-1 text-slate-300">
        <div>
          <span style={{ color: COLORS.red }}>Отставание:</span> {row.delayed}
        </div>
        <div>
          <span style={{ color: COLORS.yellow }}>Риск:</span> {row.risk}
        </div>
        <div>
          <span style={{ color: COLORS.green }}>В срок:</span> {row.onTime}
        </div>
      </div>
      {row.examples.length > 0 ? (
        <ul className="mt-2 max-h-36 list-none space-y-1 overflow-y-auto break-words text-[11px] leading-snug text-slate-400">
          {row.examples.map((ex, i) => (
            <li key={i}>
              <span className="text-slate-500">•</span> {ex}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function loadTendersForPart(partId: number): Tender[] {
  let list = mergeTenderSnapshotWithSeed(undefined);
  if (typeof window !== "undefined") {
    try {
      list = mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage());
    } catch {
      list = mergeTenderSnapshotWithSeed(undefined);
    }
  }
  return list.filter((t) => t.partId === partId);
}

export function TendersPresentation({
  activePartId,
  onChangePart,
}: {
  activePartId: number;
  onChangePart: (partId: number) => void;
}) {
  const [tick, setTick] = useState(0);
  const [dynamicsMode, setDynamicsMode] = useState<"month" | "quarter">("month");
  const [activeDrill, setActiveDrill] = useState<DrillKey | null>(null);

  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("gordo-tenders-saved", bump);
    return () => window.removeEventListener("gordo-tenders-saved", bump);
  }, []);

  const enriched = useMemo(() => {
    void tick;
    return loadTendersForPart(activePartId).map((t) => {
      const traffic = tenderTrafficFromContract(t);
      const deviation = contractDeviationDays(t);
      return { ...t, traffic, deviation };
    });
  }, [activePartId, tick]);

  const totals = useMemo(() => {
    const total = enriched.length;
    const green = enriched.filter((t) => t.traffic === "green").length;
    const yellow = enriched.filter((t) => t.traffic === "yellow").length;
    const red = enriched.filter((t) => t.traffic === "red").length;
    const gray = enriched.filter((t) => t.traffic === "gray").length;
    const costSum = enriched.reduce((s, t) => s + (t.cost ?? 0), 0);
    return { total, green, yellow, red, gray, costSum };
  }, [enriched]);

  const pieData = useMemo(
    () => [
      { name: "В срок", value: totals.green, fill: COLORS.green },
      { name: "Риск", value: totals.yellow, fill: COLORS.yellow },
      { name: "Отставание", value: totals.red, fill: COLORS.red },
      { name: "Нет договора", value: totals.gray, fill: COLORS.gray },
    ],
    [totals.green, totals.yellow, totals.red, totals.gray],
  );

  const contractsDynamics = useMemo(() => {
    const concluded = enriched.filter((t) => t.factContractDate);
    const bucket = new Map<string, number>();
    for (const t of concluded) {
      const d = t.factContractDate!;
      const y = Number(d.slice(0, 4));
      const m = Number(d.slice(5, 7));
      if (!y || !m) continue;
      let key: string;
      if (dynamicsMode === "month") {
        key = d.slice(0, 7);
      } else {
        const q = Math.floor((m - 1) / 3) + 1;
        key = `${y}-Q${q}`;
      }
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
    const keys = Array.from(bucket.keys()).sort();
    return keys.map((name) => ({ name, count: bucket.get(name) ?? 0 }));
  }, [enriched, dynamicsMode]);

  const gprStagesFromTenderCodes = useMemo(() => {
    const s = new Set<string>();
    for (const t of enriched) {
      const k = getGprStageFromTenderCode(t.code);
      if (k) s.add(k);
    }
    return Array.from(s).sort(compareGprStageCodes);
  }, [enriched]);

  const tenderGprInfluenceData = useMemo((): TenderGprInfluenceRow[] => {
    const base = enriched as unknown as Tender[];
    return gprStagesFromTenderCodes.map((stage) => {
      const stageRows = enriched.filter((t) => getGprStageFromTenderCode(t.code) === stage);
      let onTime = 0;
      let risk = 0;
      let delayed = 0;
      for (const t of stageRows) {
        const tr = tenderTrafficFromContract(t);
        if (tr === "green") onTime += 1;
        else if (tr === "yellow") risk += 1;
        else if (tr === "red") delayed += 1;
      }
      const insight = buildTenderStageInsight(base, stage);
      return {
        stage,
        label: TENDER_STAGE_CHART_LABEL[stage] ?? `Этап ${stage}`,
        onTime,
        risk,
        delayed,
        examples: insight.examples,
      };
    });
  }, [enriched, gprStagesFromTenderCodes]);

  const tenderAvgDeviationByStage = useMemo(() => {
    return gprStagesFromTenderCodes
      .map((stage) => {
        const devs = enriched
          .filter((t) => getGprStageFromTenderCode(t.code) === stage)
          .map((t) => contractDeviationDays(t))
          .filter((d): d is number => d !== null);
        if (devs.length === 0) return null;
        const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
        return {
          stage,
          label: TENDER_STAGE_CHART_LABEL[stage] ?? `Этап ${stage}`,
          avgDays: Math.round(avg * 10) / 10,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [enriched, gprStagesFromTenderCodes]);

  const costByStage = useMemo(() => {
    const sums = new Map<string, number>();
    for (const t of enriched) {
      const st = getGprStageFromTenderCode(t.code);
      if (!st) continue;
      sums.set(st, (sums.get(st) ?? 0) + (t.cost ?? 0));
    }
    return gprStagesFromTenderCodes
      .filter((k) => sums.has(k))
      .map((k) => ({
        name: TENDER_STAGE_CHART_LABEL[k] ?? `Этап ${k}`,
        cost: sums.get(k) ?? 0,
        costMln: (sums.get(k) ?? 0) / 1_000_000,
      }));
  }, [enriched, gprStagesFromTenderCodes]);

  const drillRows = useMemo(() => {
    if (!activeDrill) return [] as typeof enriched;
    if (activeDrill === "total") return enriched;
    return enriched.filter((t) => t.traffic === activeDrill);
  }, [activeDrill, enriched]);

  const partTabs = (
    <div className="mb-4 flex flex-wrap gap-2">
      {PROJECT_PARTS.map((part) => {
        const active = activePartId === part.id;
        return (
          <button
            key={part.id}
            type="button"
            onClick={() => onChangePart(part.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active ? "bg-slate-100 text-slate-900" : "bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            {part.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="space-y-6">
      {partTabs}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Закупка услуг (тендеры)</h2>
          <p className="mt-1 text-sm text-slate-400">
            Аналитика по датам заключения договоров и этапам ГПР. Данные синхронизируются с таблицей после «Сохранить» в
            режиме редактирования.
          </p>
        </div>
        <div className="group relative">
          <button
            type="button"
            className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Почему есть отставание?
          </button>
          <div className="pointer-events-none invisible absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-slate-600 bg-[#0f172a] p-3 text-left text-xs text-slate-200 shadow-xl group-hover:visible group-hover:pointer-events-auto">
            <div className="font-semibold text-slate-50">Возможные причины</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 break-words text-slate-300">
              <li>задержка тендерной процедуры или согласований;</li>
              <li>не выбран подрядчик / переторжка;</li>
              <li>нет ТМЦ или не готов проект — блокирует подписание договора;</li>
              <li>изменение объёма работ или условий контракта.</li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Отклонение в таблице: факт даты договора минус план. Пороги: в срок — ≤0 дн., риск — 1…14 дн., отставание —
              &gt;14 дн.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {(
          [
            { key: "total" as const, label: "Всего тендеров", value: totals.total, sub: "в реестре части", color: "#94a3b8" },
            { key: "green" as const, label: "В срок", value: totals.green, sub: "договор в плане или раньше", color: COLORS.green },
            { key: "yellow" as const, label: "Риск", value: totals.yellow, sub: "задержка 1…14 дн.", color: COLORS.yellow },
            { key: "red" as const, label: "Отставание", value: totals.red, sub: ">14 дн. к плану договора", color: COLORS.red },
          ] as const
        ).map((card) => {
          const active = activeDrill === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveDrill((p) => (p === card.key ? null : card.key))}
              className={`text-left rounded-[20px] border border-white/10 bg-white/5 p-5 backdrop-blur-[12px] transition-all ${
                active ? "scale-[1.02]" : ""
              }`}
              style={{
                borderLeft: `6px solid ${card.color}`,
                boxShadow: active ? `0 0 24px ${card.color}44` : "0 10px 30px rgba(0,0,0,0.3)",
              }}
            >
              <div className="text-xs text-slate-300">{card.label}</div>
              <div className="mt-2 text-3xl font-bold text-white tabular-nums">{card.value}</div>
              <div className="mt-1 text-xs text-slate-400">{card.sub}</div>
            </button>
          );
        })}
        <div
          className="text-left rounded-[20px] border border-white/10 bg-white/5 p-5 backdrop-blur-[12px]"
          style={{ borderLeft: "6px solid #38bdf8" }}
        >
          <div className="text-xs text-slate-300">Общая стоимость</div>
          <div className="mt-2 text-3xl font-bold text-white tabular-nums">
            {(totals.costSum / 1_000_000).toFixed(1)} млн
          </div>
          <div className="mt-1 text-xs text-slate-400">Σ плановых оценок по части</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-50">Динамика заключённых договоров</h3>
            <div className="flex gap-1 rounded-lg border border-slate-600 p-0.5">
              <button
                type="button"
                onClick={() => setDynamicsMode("month")}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  dynamicsMode === "month" ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Месяцы
              </button>
              <button
                type="button"
                onClick={() => setDynamicsMode("quarter")}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  dynamicsMode === "quarter" ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Кварталы
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">По фактической дате договора (только заключённые).</p>
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contractsDynamics} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8" }} />
                <Tooltip
                  contentStyle={{
                    background: COLORS.card,
                    border: "1px solid rgba(148,163,184,0.35)",
                    color: "#e2e8f0",
                  }}
                  formatter={(value) => [`${value ?? "—"} дог.`, "Количество"]}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Договоров" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-50">Статусы тендеров</h3>
          <p className="mt-1 text-xs text-slate-400">По отклонению даты договора от плана.</p>
          <div className="mt-4 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: COLORS.card,
                    border: "1px solid rgba(148,163,184,0.35)",
                    color: "#e2e8f0",
                  }}
                />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-50">Влияние тендеров на ГПР</h3>
          <p className="mt-1 text-xs text-slate-400">
            Этапы из кода тендера (<span className="font-mono text-slate-300">2.xx</span> из шифра). Столбики — число
            тендеров; без факта договора не входят в зелёный/жёлтый/красный ряд.
          </p>
          <div className="mt-4 h-[300px] w-full">
            {tenderGprInfluenceData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 text-sm text-slate-500">
                Нет данных по этапам
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tenderGprInfluenceData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-12} height={56} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8" }} />
                  <Tooltip content={<TenderGprInfluenceTooltip />} />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                  <Bar dataKey="onTime" stackId="tg" fill={COLORS.green} name="В срок" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="risk" stackId="tg" fill={COLORS.yellow} name="Риск" />
                  <Bar dataKey="delayed" stackId="tg" fill={COLORS.red} name="Отставание" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-50">Среднее отклонение договора по этапам</h3>
          <p className="mt-1 text-xs text-slate-400">
            Дни (факт − план договора), только по тендерам с подписанным договором; этап — из кода{" "}
            <span className="font-mono text-slate-300">2.xx</span>.
          </p>
          <div className="mt-4 h-[300px] w-full">
            {tenderAvgDeviationByStage.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/30 text-sm text-slate-500">
                Нет фактических дат договоров для расчёта
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tenderAvgDeviationByStage} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-12} height={56} textAnchor="end" />
                  <YAxis tick={{ fill: "#94a3b8" }} label={{ value: "дн.", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: COLORS.card,
                      border: "1px solid rgba(148,163,184,0.35)",
                      color: "#e2e8f0",
                    }}
                    formatter={(value) => [`${value} дн.`, "Среднее отклонение"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgDays"
                    stroke={COLORS.yellow}
                    strokeWidth={2.5}
                    dot={{ fill: COLORS.yellow, r: 4 }}
                    name="Среднее, дн."
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Стоимость по этапам ГПР</h3>
        <p className="mt-1 text-xs text-slate-400">
          Сумма плановых оценок (руб.) по полю «Стоимость»; этап — корень кода тендера (
          <span className="font-mono text-slate-300">2.xx</span>).
        </p>
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costByStage} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#94a3b8" }} tickFormatter={(v) => `${v}`} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: COLORS.card,
                  border: "1px solid rgba(148,163,184,0.35)",
                  color: "#e2e8f0",
                }}
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value);
                  const safe = Number.isFinite(n) ? n : 0;
                  return [`${(safe / 1_000_000).toFixed(2)} млн ₽`, "Стоимость"];
                }}
              />
              <Bar dataKey="cost" fill="#a78bfa" radius={[0, 4, 4, 0]} name="Стоимость" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-[#1e293b] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-50">Детализация</h3>
        {!activeDrill ? (
          <p className="mt-3 text-sm text-slate-300">
            Нажмите одну из верхних карточек (кроме стоимости), чтобы показать список тендеров по статусу договора или весь реестр.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {drillRows.map((t) => {
              const c = COLORS[t.traffic];
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/25 p-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-500">{t.code}</div>
                    <div className="text-sm font-semibold text-slate-100 break-words">{t.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Этап {t.stage} • План договора {t.planContractDate}
                      {t.factContractDate ? ` • Факт ${t.factContractDate}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="font-semibold tabular-nums" style={{ color: c }}>
                      {t.deviation === null ? "—" : t.deviation > 0 ? `+${t.deviation}` : t.deviation} дн
                    </div>
                    <div className="mt-1 rounded-full px-2 py-0.5 text-[11px] text-slate-900" style={{ backgroundColor: c }}>
                      {tenderTrafficLabel(t.traffic)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
