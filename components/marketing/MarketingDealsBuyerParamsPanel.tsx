"use client";

import { useMemo } from "react";

import {
  DEALS_LABEL_EM_DASH,
  DEALS_LABEL_UNSPECIFIED,
  dealEffectiveObjectPriceRub,
  type DealBuyerPaymentCategory,
  type DealBuyerProfile,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { formatDealObjectTotalCompactRub } from "@/lib/dealsObjectParamsAnalyticsFormat";
import { buyerIdentityDedupeKey } from "@/lib/marketingDealBuyerEntity";
import { buyerAgeYearsFromYmd, maskEmailDisplay, maskPhoneDisplay } from "@/lib/marketingDealBuyerPrivacy";
import { numFmt } from "@/lib/salesPlanChartFormat";

const PREVIEW_CAP = 500;

const KPI_SURFACE =
  "relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50/80 px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm";

const TABLE_SHELL =
  "overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_32px_rgba(15,23,42,0.045)] backdrop-blur-[6px]";

const WIDGET =
  "rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-[0_6px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm";

type Props = {
  rows: NormalizedDealRow[];
  loading: boolean;
};

function rowHasBuyerSignal(r: NormalizedDealRow): boolean {
  if (r.buyerProfile.hasRichFields) return true;
  const c = r.clientLabel?.trim();
  return Boolean(c && c !== DEALS_LABEL_UNSPECIFIED);
}

function displayBuyerName(r: NormalizedDealRow): string {
  const n = r.buyerProfile.fullName?.trim();
  if (n) return n;
  const c = r.clientLabel?.trim();
  if (c && c !== DEALS_LABEL_UNSPECIFIED) return c;
  return DEALS_LABEL_EM_DASH;
}

function paymentCategoryRu(c: DealBuyerPaymentCategory | null | undefined): string {
  switch (c) {
    case "mortgage":
      return "Ипотека";
    case "installment":
      return "Рассрочка";
    case "cash":
      return "Наличные / полная оплата";
    case "mixed":
      return "Смешанная";
    default:
      return "";
  }
}

function DistributionBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-[10px] text-slate-600">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums font-semibold text-slate-800">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100/90" />
        ))}
      </div>
      <div className="h-40 rounded-2xl bg-slate-100/90" />
      <div className="h-32 rounded-2xl bg-slate-100/90" />
    </div>
  );
}

function aggregateBuyers(rows: NormalizedDealRow[]) {
  const withSignal = rows.filter(rowHasBuyerSignal);
  const idKeys = new Set<string>();
  for (const r of withSignal) {
    const k =
      buyerIdentityDedupeKey({
        fullName: r.buyerProfile.fullName,
        phone: r.buyerProfile.phone,
        email: r.buyerProfile.email,
      }) ??
      (() => {
        const c = r.clientLabel?.trim().toLowerCase();
        return c && c !== DEALS_LABEL_UNSPECIFIED.toLowerCase() ? `c:${c}` : null;
      })();
    if (k) idKeys.add(k);
  }
  const uniqueBuyers = idKeys.size;

  const budgets = withSignal.map((r) => r.buyerProfile.budgetRub).filter((x): x is number => x != null && x > 0);
  const avgBudget = budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) / budgets.length : null;

  const ages: number[] = [];
  for (const r of withSignal) {
    const a = buyerAgeYearsFromYmd(r.buyerProfile.birthDate);
    if (a != null) ages.push(a);
  }
  const avgAge = ages.length > 0 ? ages.reduce((x, y) => x + y, 0) / ages.length : null;

  const mortgageOrMixed = withSignal.filter((r) => r.buyerProfile.paymentCategory === "mortgage" || r.buyerProfile.paymentCategory === "mixed").length;
  const installmentOrMixed = withSignal.filter((r) => r.buyerProfile.paymentCategory === "installment" || r.buyerProfile.paymentCategory === "mixed").length;
  const payBase = withSignal.filter((r) => r.buyerProfile.paymentCategory != null && r.buyerProfile.paymentCategory !== "unknown").length;

  const pctMort = payBase > 0 ? (mortgageOrMixed / payBase) * 100 : null;
  const pctInst = payBase > 0 ? (installmentOrMixed / payBase) * 100 : null;

  const sums = rows.map((r) => dealEffectiveObjectPriceRub(r)).filter((x) => x > 0);
  const avgPurchase = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : null;

  const cityMap = new Map<string, number>();
  for (const r of withSignal) {
    const c = r.buyerProfile.city?.trim();
    if (!c) continue;
    cityMap.set(c, (cityMap.get(c) ?? 0) + 1);
  }
  const cityTotal = [...cityMap.values()].reduce((a, b) => a + b, 0);

  const payDist = new Map<string, number>();
  for (const r of withSignal) {
    const cat = r.buyerProfile.paymentCategory;
    if (cat == null || cat === "unknown") {
      const lbl = r.buyerProfile.paymentLabel?.trim();
      if (lbl) payDist.set(lbl, (payDist.get(lbl) ?? 0) + 1);
      continue;
    }
    const lab = paymentCategoryRu(cat) || cat;
    payDist.set(lab, (payDist.get(lab) ?? 0) + 1);
  }
  const payTotal = [...payDist.values()].reduce((a, b) => a + b, 0);

  const ageBins = { a: 0, b: 0, c: 0, d: 0 };
  for (const a of ages) {
    if (a < 26) ageBins.a += 1;
    else if (a < 36) ageBins.b += 1;
    else if (a < 46) ageBins.c += 1;
    else ageBins.d += 1;
  }
  const ageTotal = ages.length;

  return {
    withSignal,
    uniqueBuyers,
    avgBudget,
    avgAge,
    pctMort,
    pctInst,
    payBase,
    avgPurchase,
    cityMap,
    cityTotal,
    payDist,
    payTotal,
    ageBins,
    ageTotal,
  };
}

function buildInsights(a: ReturnType<typeof aggregateBuyers>): string[] {
  const lines: string[] = [];
  if (a.withSignal.length === 0) return lines;
  if (a.uniqueBuyers > 0) {
    lines.push(`В срезе выделено ${numFmt.format(a.uniqueBuyers)} уникальных покупателей (по телефону, e-mail или ФИО; иначе по подписи клиента).`);
  }
  if (a.avgPurchase != null) {
    lines.push(`Средняя стоимость сделки в выборке: ${formatDealObjectTotalCompactRub(a.avgPurchase)}.`);
  }
  if (a.pctMort != null && a.payBase > 0) {
    lines.push(`Доля сделок с признаками ипотеки в способе оплаты: ${a.pctMort.toFixed(1)}% (из ${numFmt.format(a.payBase)} с указанным типом).`);
  }
  if (a.pctInst != null && a.payBase > 0) {
    lines.push(`Доля с признаками рассрочки: ${a.pctInst.toFixed(1)}%.`);
  }
  if (a.cityMap.size > 0) {
    const top = [...a.cityMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    lines.push(`Топ городов: ${top.map(([k, v]) => `${k} (${numFmt.format(v)})`).join(" · ")}.`);
  }
  if (a.ageTotal >= 3) {
    lines.push(
      `Распределение по возрасту (по дате рождения): до 26 — ${numFmt.format(a.ageBins.a)}, 26–35 — ${numFmt.format(a.ageBins.b)}, 36–45 — ${numFmt.format(a.ageBins.c)}, 46+ — ${numFmt.format(a.ageBins.d)}.`,
    );
  }
  return lines;
}

export function MarketingDealsBuyerParamsPanel({ rows, loading }: Props) {
  const agg = useMemo(() => aggregateBuyers(rows), [rows]);
  const sorted = useMemo(
    () => [...rows].filter(rowHasBuyerSignal).sort((a, b) => b.dealDateMs - a.dealDateMs),
    [rows],
  );
  const slice = useMemo(() => sorted.slice(0, PREVIEW_CAP), [sorted]);
  const insights = useMemo(() => buildInsights(agg), [agg]);
  const hasAnyBuyer = rows.some(rowHasBuyerSignal);

  const topCities = useMemo(() => {
    if (agg.cityTotal === 0) return [];
    return [...agg.cityMap.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([city, count]) => ({
        city,
        pct: (count / agg.cityTotal) * 100,
      }));
  }, [agg.cityMap, agg.cityTotal]);

  const payBars = useMemo(() => {
    if (agg.payTotal === 0) return [];
    return [...agg.payDist.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([label, count], i) => ({
        label,
        pct: (count / agg.payTotal) * 100,
        color: ["#6366f1", "#8b5cf6", "#06b6d4", "#f97316", "#94a3b8", "#64748b"][i % 6] ?? "#64748b",
      }));
  }, [agg.payDist, agg.payTotal]);

  const ageBars = useMemo(() => {
    if (agg.ageTotal === 0) return [];
    const spec = [
      { label: "до 26", key: "a" as const },
      { label: "26–35", key: "b" as const },
      { label: "36–45", key: "c" as const },
      { label: "46+", key: "d" as const },
    ];
    return spec
      .map((s, i) => ({
        label: s.label,
        pct: (agg.ageBins[s.key] / agg.ageTotal) * 100,
        color: ["#38bdf8", "#818cf8", "#c084fc", "#fb923c"][i],
      }))
      .filter((x) => x.pct > 0);
  }, [agg.ageBins, agg.ageTotal]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Параметры покупателей</h3>
          <p className="mt-1 text-[11px] text-slate-600">Загрузка профилей из JSON…</p>
        </div>
        <SkeletonBlock />
      </div>
    );
  }

  if (!hasAnyBuyer) {
    return (
      <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-2.5">
        <h3 className="text-xs font-semibold text-slate-900">Параметры покупателей</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
          В выгрузке не найдено устойчивых полей профиля (ФИО, контакты, оплата, город и т.д.) — в том числе после рекурсивного обхода JSON. Если данные есть под нестандартными ключами, в консоли браузера включите отладку:{" "}
          <code className="rounded bg-white px-0.5 font-mono text-[9px]">localStorage.setItem(&apos;DEBUG_DEAL_BUYER&apos;,&apos;1&apos;)</code> и перезагрузите страницу (или задайте{" "}
          <code className="rounded bg-white px-0.5 font-mono text-[9px]">NEXT_PUBLIC_DEBUG_DEAL_BUYER=1</code>).
        </p>
      </div>
    );
  }

  const kpiItems: Array<{ key: string; title: string; value: string; hint?: string }> = [];
  if (agg.uniqueBuyers > 0) {
    kpiItems.push({
      key: "ub",
      title: "Уникальных покупателей",
      value: numFmt.format(agg.uniqueBuyers),
      hint: "По телефону, e-mail или ФИО в срезе (приоритет контактам)",
    });
  }
  if (agg.avgBudget != null) {
    kpiItems.push({
      key: "bud",
      title: "Средний бюджет",
      value: formatDealObjectTotalCompactRub(agg.avgBudget),
      hint: "По полям budget в JSON",
    });
  }
  if (agg.avgAge != null) {
    kpiItems.push({
      key: "age",
      title: "Средний возраст",
      value: `${agg.avgAge.toFixed(1)} лет`,
      hint: "По дате рождения, где указана",
    });
  }
  if (agg.pctMort != null && agg.payBase > 0) {
    kpiItems.push({
      key: "m",
      title: "% ипотек",
      value: `${agg.pctMort.toFixed(1)}%`,
      hint: `Ипотека и смешанные, ${numFmt.format(agg.payBase)} сделок с типом оплаты`,
    });
  }
  if (agg.pctInst != null && agg.payBase > 0) {
    kpiItems.push({
      key: "i",
      title: "% рассрочек",
      value: `${agg.pctInst.toFixed(1)}%`,
      hint: "Рассрочка и смешанные",
    });
  }
  if (agg.avgPurchase != null) {
    kpiItems.push({
      key: "p",
      title: "Средняя стоимость покупки",
      value: formatDealObjectTotalCompactRub(agg.avgPurchase),
      hint: "По сумме сделки в текущем срезе",
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Параметры покупателей</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Данные из JSON: явные поля выгрузки и вложенные совпадения по путям (телефон, e-mail, ФИО, оплата, город и др.). Телефон и e-mail маскируются. Фильтры совпадают с предпросмотром сделок.
        </p>
      </div>

      {kpiItems.length > 0 ? (
        <div className={`grid gap-3 ${kpiItems.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {kpiItems.map((k) => (
            <div key={k.key} className={KPI_SURFACE}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">{k.title}</div>
              <div className="mt-2 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">{k.value}</div>
              {k.hint ? <p className="mt-1 text-[9px] leading-snug text-slate-500/85">{k.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${WIDGET} lg:col-span-1`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Способ оплаты</div>
          <div className="mt-3 space-y-3">
            {payBars.length === 0 ? (
              <p className="text-xs text-slate-500">Нет полей оплаты в срезе.</p>
            ) : (
              payBars.map((b) => (
                <DistributionBar key={b.label} label={b.label} pct={b.pct} color={b.color} />
              ))
            )}
          </div>
        </div>
        <div className={`${WIDGET} lg:col-span-1`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Города</div>
          <div className="mt-3 space-y-3">
            {topCities.length === 0 ? (
              <p className="text-xs text-slate-500">Город не указан в JSON.</p>
            ) : (
              topCities.map((b, i) => (
                <DistributionBar key={b.city} label={b.city} pct={b.pct} color={["#0ea5e9", "#6366f1", "#a855f7", "#f43f5e", "#14b8a6", "#eab308"][i % 6] ?? "#64748b"} />
              ))
            )}
          </div>
        </div>
        <div className={`${WIDGET} lg:col-span-1`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Возраст (по дате рождения)</div>
          <div className="mt-3 space-y-3">
            {ageBars.length === 0 ? (
              <p className="text-xs text-slate-500">Нет дат рождения для расчёта.</p>
            ) : (
              ageBars.map((b) => <DistributionBar key={b.label} label={b.label} pct={b.pct} color={b.color} />)
            )}
          </div>
        </div>
      </div>

      {insights.length > 0 ? (
        <div className={WIDGET}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">Инсайты</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-slate-700">
            {insights.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={TABLE_SHELL}>
        <div className="max-h-[min(480px,65vh)] w-full overflow-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-[1] border-b border-slate-200/90 bg-slate-50/95 backdrop-blur-sm">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <th className="px-4 py-3 font-medium">Покупатель</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Город</th>
                <th className="px-4 py-3 text-right font-medium">Возраст</th>
                <th className="px-4 py-3 font-medium">Способ покупки</th>
                <th className="px-4 py-3 text-right font-medium">Бюджет</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r, idx) => {
                const bp: DealBuyerProfile = r.buyerProfile;
                const age = buyerAgeYearsFromYmd(bp.birthDate);
                const pay =
                  bp.paymentLabel?.trim() ||
                  (bp.paymentCategory && bp.paymentCategory !== "unknown" ? paymentCategoryRu(bp.paymentCategory) : "") ||
                  DEALS_LABEL_EM_DASH;
                const budgetDisp =
                  bp.budgetRub != null && bp.budgetRub > 0 ? formatDealObjectTotalCompactRub(bp.budgetRub) : DEALS_LABEL_EM_DASH;
                const phoneM = maskPhoneDisplay(bp.phone);
                const emailM = maskEmailDisplay(bp.email);
                const contactLine = [phoneM, emailM].filter(Boolean).join(" · ");
                return (
                  <tr key={`${r.dealDateMs}-${displayBuyerName(r)}-${idx}`} className="border-b border-slate-100/90 hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 align-top text-slate-900">
                      <div className="font-semibold leading-snug">{displayBuyerName(r)}</div>
                      {contactLine ? <div className="mt-0.5 font-mono text-[10px] text-slate-500">{contactLine}</div> : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{bp.buyerType?.trim() || DEALS_LABEL_EM_DASH}</td>
                    <td className="px-4 py-2.5 text-slate-700">{bp.city?.trim() || DEALS_LABEL_EM_DASH}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{age != null ? String(age) : DEALS_LABEL_EM_DASH}</td>
                    <td className="max-w-[200px] px-4 py-2.5 text-slate-700">
                      <span className="break-words">{pay}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">{budgetDisp}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sorted.length > slice.length ? (
        <p className="text-[11px] text-slate-500">
          Показано {numFmt.format(slice.length)} из {numFmt.format(sorted.length)} строк с данными покупателя.
        </p>
      ) : null}
    </div>
  );
}
