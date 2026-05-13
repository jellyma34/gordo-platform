"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { buildSalesDealsChartDatasetFromRows } from "@/lib/buildSalesDealsChartDatasetFromRows";
import { filterNormalizedDealsForEditPreview } from "@/lib/marketingDealsPreviewFilters";
import { validateMarketingDealsUploadJson } from "@/lib/marketingDealsValidateUploaded";
import { numFmt, rubFmt } from "@/lib/salesPlanChartFormat";
import { funnelStepConversionRates } from "@/lib/salesDealsMockData";
import { useMarketingDealsFeed } from "@/components/marketing/marketingDealsFeedContext";
import { MarketingDealsObjectParamsPanel } from "@/components/marketing/MarketingDealsObjectParamsPanel";
import { MarketingDealsBuyerParamsPanel } from "@/components/marketing/MarketingDealsBuyerParamsPanel";
import type { MarketingDealsJsonFeed } from "@/components/marketing/useMarketingDealsJson";
import type { MarketingPeriodGranularity } from "./MarketingFilters";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charting/rechartsClient";

const CARD_PRESENTATION =
  "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const CARD_EDIT = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
  dealTypeId: string;
};

type UploadsMeta = {
  versions: Array<{ id: string; savedAt: string; mode: string; rowCount: number }>;
  currentUpdatedAt: string | null;
  hasLocalDataset: boolean;
};

function formatRuDateShort(iso: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!d) return iso;
  return `${d[3]}.${d[2]}.${d[1]}`;
}

function DealsMarketingEditPanel({
  objectId,
  dealTypeId,
  feed,
}: {
  objectId: string;
  dealTypeId: string;
  feed: MarketingDealsJsonFeed;
}) {
  const { loading, error, reload, rows } = feed;
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadMode, setUploadMode] = useState<"replace" | "append">("replace");
  const [pendingJson, setPendingJson] = useState<unknown | null>(null);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rollbackBusyId, setRollbackBusyId] = useState<string | null>(null);
  const [meta, setMeta] = useState<UploadsMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const res = await fetch("/api/deals/uploads");
      const j = (await res.json()) as UploadsMeta;
      if (!res.ok) throw new Error("Версии не загружены");
      setMeta(j);
    } catch {
      setMeta(null);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const filteredPreview = useMemo(
    () => filterNormalizedDealsForEditPreview(rows, objectId, dealTypeId),
    [rows, objectId, dealTypeId],
  );

  const previewSlice = useMemo(() => filteredPreview.slice(0, 500), [filteredPreview]);

  const validatePending = useCallback((json: unknown) => {
    const r = validateMarketingDealsUploadJson(json);
    if (!r.ok) {
      setClientErrors(r.errors);
      return false;
    }
    setClientErrors([]);
    return true;
  }, []);

  const onFilePick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setPendingJson(null);
        setClientErrors(["Файл не является корректным JSON."]);
        return;
      }
      setPendingJson(parsed);
      validatePending(parsed);
    };
    reader.readAsText(file, "UTF-8");
  }, [validatePending]);

  const submitUpload = useCallback(async () => {
    if (pendingJson == null) return;
    if (!validatePending(pendingJson)) return;

    const effectiveMode = uploadMode;
    const needsLocalForAppend =
      effectiveMode === "append" &&
      !(meta?.hasLocalDataset ?? false);

    const modeToSend =
      effectiveMode === "append" && needsLocalForAppend
        ? "replace"
        : effectiveMode;

    setBusy(true);
    try {
      const res = await fetch("/api/deals/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: pendingJson, mode: modeToSend }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setClientErrors([j.error ?? `Ошибка сервера ${res.status}`]);
        return;
      }
      setPendingJson(null);
      setClientErrors([]);
      await loadMeta();
      await reload();
    } catch {
      setClientErrors(["Сеть недоступна или сервер вернул не JSON."]);
    } finally {
      setBusy(false);
    }
  }, [pendingJson, uploadMode, meta?.hasLocalDataset, validatePending, loadMeta, reload]);

  const rollback = useCallback(
    async (versionId: string) => {
      setRollbackBusyId(versionId);
      try {
        const res = await fetch("/api/deals/uploads", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setClientErrors([j.error ?? "Откат не выполнен"]);
          return;
        }
        setClientErrors([]);
        await loadMeta();
        await reload();
      } catch {
        setClientErrors(["Не удалось откатиться к версии"]);
      } finally {
        setRollbackBusyId(null);
      }
    },
    [loadMeta, reload],
  );

  const dataLoaded = rows.length > 0;
  const lastLabel =
    meta?.currentUpdatedAt != null
      ? new Date(meta.currentUpdatedAt).toLocaleString("ru-RU")
      : null;

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border px-4 py-3 ${dataLoaded ? "border-emerald-200 bg-emerald-50/80" : "border-amber-200 bg-amber-50/80"}`}>
        <div className="text-sm font-semibold text-slate-900">
          Статус данных:{" "}
          {loading || metaLoading
            ? "загрузка…"
            : dataLoaded
              ? "Загружены"
              : "Нет нормализованных строк"}
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {meta?.hasLocalDataset
            ? `Используется локальный снимок. Последнее обновление: ${lastLabel ?? "—"}`
            : error
              ? `Ошибка загрузки: ${error}. При необходимости загрузите JSON ниже.`
              : "Данные из внешнего API (локального снимка нет)."}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Нормализованных строк в предпросмотре (с учётом фильтров): {numFmt.format(filteredPreview.length)} из{" "}
          {numFmt.format(rows.length)} в наборе.
        </div>
      </div>

      {error && !dataLoaded ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className={CARD_EDIT}>
        <h3 className="text-sm font-semibold text-slate-900">Загрузка JSON</h3>
        <p className="mt-1 text-[11px] text-slate-600">
          Формат как у выгрузки сделок: массив, <code className="rounded bg-slate-100 px-1">{"{ data: [...] }"}</code> или объект с
          полями-массивами.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFilePick} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Выбрать файл…
          </button>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>Режим</span>
            <select
              value={uploadMode}
              onChange={(e) => setUploadMode(e.target.value as "replace" | "append")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            >
              <option value="replace">Замена</option>
              <option value="append">Дополнить</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pendingJson == null || busy || clientErrors.length > 0}
            onClick={() => void submitUpload()}
            className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Сохранить на сервер"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          При режиме «Дополнение» строки добавляются к текущему локальному снимку (если снимка ещё нет — сохранится как замена).
        </p>

        {clientErrors.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 rounded-md border border-rose-200 bg-rose-50 px-5 py-2 text-xs text-rose-800">
            {clientErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        ) : null}

        {pendingJson != null && clientErrors.length === 0 ? (
          <p className="mt-3 text-xs text-emerald-800">Структура допустима, можно сохранить.</p>
        ) : null}
      </div>

      <div className={CARD_EDIT}>
        <h3 className="text-sm font-semibold text-slate-900">Предпросмотр (первые {previewSlice.length} строк)</h3>
        <p className="mt-1 text-[11px] text-slate-600">
          Колонки: дата, тип объекта (категория для аналитики), количество (1 строка — 1 сделка), сумма. Учитываются фильтры
          «Объект» и «Тип сделки» выше.
        </p>
        <div className="mt-3 max-h-[440px] w-full overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-[520px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-2 py-2">Дата</th>
                <th className="border-b border-slate-200 px-2 py-2">Тип объекта</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Кол-во</th>
                <th className="border-b border-slate-200 px-2 py-2 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {previewSlice.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={4}>
                    {loading ? "Загрузка…" : "Нет строк в этом срезе."}
                  </td>
                </tr>
              ) : (
                previewSlice.map((r, idx) => (
                  <tr
                    key={`${r.clientLabel}:${r.objectLabel}:${r.dealDate}:${r.sumRub}:${idx}`}
                    className="odd:bg-white even:bg-slate-50/70"
                  >
                    <td className="border-b border-slate-100 px-2 py-1.5 tabular-nums text-slate-800">
                      {formatRuDateShort(r.dealDate)}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-slate-800">{r.dealTypeLabel}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-800">1</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-900">
                      {rubFmt.format(r.sumRub)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredPreview.length > previewSlice.length ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Показано {previewSlice.length} из {filteredPreview.length} строк в фильтре.
          </p>
        ) : null}
      </div>

      <div className={CARD_EDIT}>
        <MarketingDealsObjectParamsPanel rows={filteredPreview} loading={loading} />
      </div>

      <div className={CARD_EDIT}>
        <MarketingDealsBuyerParamsPanel rows={filteredPreview} loading={loading} />
      </div>

      <div className={CARD_EDIT}>
        <h3 className="text-sm font-semibold text-slate-900">История загрузок</h3>
        <p className="mt-1 text-[11px] text-slate-600">
          Последние сохранённые версии. «Откат» восстанавливает снимок на сервере и перечитывает данные.
        </p>
        {metaLoading ? (
          <p className="mt-3 text-sm text-slate-500">Чтение истории…</p>
        ) : !meta?.versions?.length ? (
          <p className="mt-3 text-sm text-slate-500">Пока нет сохранённых версий.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {meta.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div>
                  <div className="font-medium text-slate-900">
                    {new Date(v.savedAt).toLocaleString("ru-RU")}{" "}
                    <span className="font-normal text-slate-600">
                      ({v.mode === "append" ? "дополнение" : v.mode === "replace" ? "замена" : v.mode})
                    </span>
                  </div>
                  <div className="text-slate-600">Строк оценкой: {numFmt.format(v.rowCount)} · id: {v.id}</div>
                </div>
                <button
                  type="button"
                  disabled={rollbackBusyId !== null}
                  onClick={() => void rollback(v.id)}
                  className="rounded border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {rollbackBusyId === v.id ? "Откат…" : "Откатиться"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SalesDealsSection({ presentation, period, objectId, dealTypeId }: Props) {
  const dealsFeed = useMarketingDealsFeed();

  if (!presentation) {
    return <DealsMarketingEditPanel objectId={objectId} dealTypeId={dealTypeId} feed={dealsFeed} />;
  }

  const { loading, error, reload, rows } = dealsFeed;

  const dataset = useMemo(() => {
    if (error) return null;
    return buildSalesDealsChartDatasetFromRows(rows);
  }, [error, rows]);

  void period;

  const card = CARD_PRESENTATION;
  const h4 = "text-sm font-semibold text-slate-100";
  const sub = "text-[11px] text-slate-500";
  const muted = "text-slate-400";
  const axisTick = "#94a3b8";
  const gridStroke = "rgba(148,163,184,0.12)";
  const tooltipShell =
    "rounded-lg border border-slate-600/50 bg-[#0f172a]/95 px-2.5 py-1.5 text-[11px] text-slate-200";

  const stepRates = useMemo(
    () => (dataset ? funnelStepConversionRates(dataset.funnel) : []),
    [dataset],
  );

  const hasLeadsInMonthly = useMemo(
    () => dataset?.monthly.some((r) => r.leadsMonth > 0) ?? false,
    [dataset],
  );

  const funnelKpiSurface =
    "relative overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

  const cycleSurface =
    "relative overflow-hidden rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

  if (loading) {
    return (
      <div className={card}>
        <div className={`flex min-h-[200px] flex-col items-center justify-center gap-3 ${muted}`}>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent border-sky-400" aria-hidden />
          <p className="text-sm">Загрузка данных по сделкам…</p>
        </div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className={card}>
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4">
          <p className="text-sm font-medium text-rose-200">Не удалось загрузить сделки</p>
          <p className="mt-1 text-xs text-rose-300/90">{error ?? "Неизвестная ошибка"}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 rounded-lg border border-slate-500/50 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className={h4}>Воронка продаж</h3>
        <p className={`mt-1 ${sub}`}>Этапы: лиды → встречи → брони → сделки. Доли перехода между этапами.</p>
        <p className={`mt-2 text-[10px] ${muted}`}>
          В выгрузке есть только зарегистрированные сделки; промежуточные этапы в JSON не передаются.
        </p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-stretch lg:justify-between">
          {dataset.funnel.map((stage, idx) => (
            <div key={stage.id} className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-[22%]">
              <div className={`min-w-0 flex-1 ${funnelKpiSurface}`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">{stage.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-50">
                  {stage.count > 0 || stage.id === "deals" ? numFmt.format(stage.count) : "—"}
                </div>
              </div>
              {idx < dataset.funnel.length - 1 ? (
                <div className={`hidden shrink-0 flex-col items-center px-1 text-center lg:flex`}>
                  <span className="text-lg text-slate-500" aria-hidden>
                    →
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold tabular-nums text-sky-300">
                    {stepRates[idx] != null && dataset.funnel[idx]!.count > 0
                      ? `${stepRates[idx]!.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] ${muted}`}>
          {dataset.funnel.slice(0, -1).map((stage, idx) => (
            <span key={`${stage.id}-rate`}>
              {stage.label} → {dataset.funnel[idx + 1]!.label}:{" "}
              <span className="font-semibold tabular-nums text-slate-300">
                {stepRates[idx] != null && stage.count > 0 ? `${stepRates[idx]!.toFixed(1)}%` : "—"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={card}>
          <h3 className={h4}>Сделки по месяцам</h3>
          <p className={`mt-1 ${sub}`}>Факт по месяцам (шт.) по дате сделки в выгрузке.</p>
          {dataset.monthly.length === 0 ? (
            <p className={`mt-8 text-center text-sm ${muted}`}>Нет сделок с датой для группировки по месяцам.</p>
          ) : (
            <div className="mt-3 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataset.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisTick, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                  <YAxis tick={{ fill: axisTick, fontSize: 10 }} axisLine={false} width={36} tickFormatter={(v) => numFmt.format(v)} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as (typeof dataset.monthly)[0] | undefined;
                      if (!row) return null;
                      return (
                        <div className={tooltipShell}>
                          <div className="font-semibold">{label}</div>
                          <div className="tabular-nums">Сделок: {numFmt.format(row.factMonth)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="factMonth"
                    name="Сделки"
                    fill="#38bdf8"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={card}>
          <h3 className={h4}>Конверсия</h3>
          <p className={`mt-1 ${sub}`}>Сделки / лиды (%), динамика по месяцам.</p>
          {!hasLeadsInMonthly ? (
            <p className={`mt-8 text-center text-sm ${muted}`}>
              В этой выгрузке нет помесячных лидов — конверсию посчитать нельзя.
            </p>
          ) : (
            <div className="mt-3 h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dataset.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisTick, fontSize: 10 }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                  <YAxis
                    tick={{ fill: axisTick, fontSize: 10 }}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v) => `${v}%`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as (typeof dataset.monthly)[0] | undefined;
                      if (!row) return null;
                      return (
                        <div className={tooltipShell}>
                          <div className="font-semibold">{label}</div>
                          <div className="tabular-nums">Конверсия: {row.conversionPct.toFixed(1)}%</div>
                          <div className={`tabular-nums ${muted}`}>
                            Сделок {numFmt.format(row.factMonth)} / лидов {numFmt.format(row.leadsMonth)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversionPct"
                    name="Сделки / лиды"
                    stroke="#a78bfa"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#c4b5fd" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {dataset.avgDealCycleDays != null ? (
        <div className={card}>
          <h3 className={h4}>Средний цикл сделки</h3>
          <p className={`mt-1 ${sub}`}>От лида до регистрации сделки.</p>
          <div className={`mt-3 ${cycleSurface}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-200/75">Дней</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">
              {numFmt.format(dataset.avgDealCycleDays)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
