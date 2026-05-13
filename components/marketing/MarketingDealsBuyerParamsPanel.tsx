"use client";

import { useMemo } from "react";

import {
  DEALS_LABEL_EM_DASH,
  DEALS_LABEL_UNSPECIFIED,
  type DealBuyerPaymentCategory,
  type DealBuyerProfile,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { formatDealObjectTotalCompactRub } from "@/lib/dealsObjectParamsAnalyticsFormat";
import { buyerIdentityDedupeKey } from "@/lib/marketingDealBuyerEntity";
import { buyerAgeYearsFromYmd, maskEmailDisplay, maskPhoneDisplay } from "@/lib/marketingDealBuyerPrivacy";
import { numFmt } from "@/lib/salesPlanChartFormat";

const PREVIEW_CAP = 500;

const KPI_CARD =
  "rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-900/[0.03]";

const TABLE_SHELL =
  "overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03]";

const PANEL_WIDGET =
  "rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm ring-1 ring-slate-900/[0.03]";

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
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[4.25rem] rounded-xl bg-slate-100/90" />
        ))}
      </div>
      <div className="h-28 rounded-xl bg-slate-100/90" />
      <div className="h-24 rounded-xl bg-slate-100/90" />
      <div className="h-40 rounded-xl bg-slate-100/90" />
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
  if (a.avgBudget != null) {
    lines.push(`Средний заявленный бюджет: ${formatDealObjectTotalCompactRub(a.avgBudget)}.`);
  }
  if (a.avgAge != null) {
    lines.push(`Средний возраст по датам рождения: ${a.avgAge.toFixed(1)} лет (${numFmt.format(a.ageTotal)} строк с датой рождения).`);
  }
  if (a.ageTotal >= 3) {
    lines.push(
      `Распределение по возрасту: до 26 — ${numFmt.format(a.ageBins.a)}, 26–35 — ${numFmt.format(a.ageBins.b)}, 36–45 — ${numFmt.format(a.ageBins.c)}, 46+ — ${numFmt.format(a.ageBins.d)}.`,
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
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold tracking-tight text-slate-900">Параметры покупателей</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">Загрузка профилей из JSON…</p>
        </div>
        <SkeletonBlock />
      </div>
    );
  }

  if (!hasAnyBuyer) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 ring-1 ring-slate-900/[0.02]">
        <h3 className="text-xs font-semibold tracking-tight text-slate-900">Параметры покупателей</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
          В выгрузке не найдено устойчивых полей профиля (ФИО, контакты, оплата, город и т.д.) — в том числе после рекурсивного обхода JSON. Если данные есть под нестандартными ключами, в консоли браузера включите отладку:{" "}
          <code className="rounded bg-white px-0.5 font-mono text-[9px]">localStorage.setItem(&apos;DEBUG_DEAL_BUYER&apos;,&apos;1&apos;)</code> и перезагрузите страницу (или задайте{" "}
          <code className="rounded bg-white px-0.5 font-mono text-[9px]">NEXT_PUBLIC_DEBUG_DEAL_BUYER=1</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold tracking-tight text-slate-900">Параметры покупателей</h3>
        <p className="mt-0.5 max-w-2xl text-[10px] leading-relaxed text-slate-500">
          ФИО и контакты из выгрузки (маскировка телефона и e-mail). Фильтры совпадают с предпросмотром сделок.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className={KPI_CARD}>
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Уникальных покупателей</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{numFmt.format(agg.uniqueBuyers)}</div>
          <p className="mt-0.5 text-[9px] leading-snug text-slate-500">Телефон → e-mail → ФИО</p>
        </div>
        <div className={KPI_CARD}>
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Средний бюджет</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {agg.avgBudget != null ? formatDealObjectTotalCompactRub(agg.avgBudget) : DEALS_LABEL_EM_DASH}
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-slate-500">По полям budget в JSON</p>
        </div>
        <div className={KPI_CARD}>
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Средний возраст</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
            {agg.avgAge != null ? `${agg.avgAge.toFixed(1)} лет` : DEALS_LABEL_EM_DASH}
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-slate-500">По дате рождения, где указана</p>
        </div>
      </div>

      {ageBars.length > 0 ? (
        <div className={PANEL_WIDGET}>
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Возраст (по дате рождения)</div>
          <div className="mt-3 max-w-md space-y-2.5">
            {ageBars.map((b) => (
              <DistributionBar key={b.label} label={b.label} pct={b.pct} color={b.color} />
            ))}
          </div>
        </div>
      ) : null}

      {insights.length > 0 ? (
        <div className={PANEL_WIDGET}>
          <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Инсайты</div>
          <ul className="mt-2 list-disc space-y-1 pl-3.5 text-[11px] leading-relaxed text-slate-700">
            {insights.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className={TABLE_SHELL}>
          <div className="max-h-[min(520px,68vh)] w-full overflow-auto">
            <table className="min-w-[720px] w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-[1] border-b border-slate-200/90 bg-slate-50/95 backdrop-blur-sm">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Покупатель</th>
                  <th className="px-4 py-2.5 font-medium">Тип</th>
                  <th className="px-4 py-2.5 font-medium">Город</th>
                  <th className="px-4 py-2.5 text-right font-medium">Возраст</th>
                  <th className="px-4 py-2.5 font-medium">Способ покупки</th>
                  <th className="px-4 py-2.5 text-right font-medium">Бюджет</th>
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
                      <td className="px-4 py-2 align-top text-slate-900">
                        <div className="font-semibold leading-snug">{displayBuyerName(r)}</div>
                        {contactLine ? <div className="mt-0.5 font-mono text-[10px] text-slate-500">{contactLine}</div> : null}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{bp.buyerType?.trim() || DEALS_LABEL_EM_DASH}</td>
                      <td className="px-4 py-2 text-slate-700">{bp.city?.trim() || DEALS_LABEL_EM_DASH}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-800">{age != null ? String(age) : DEALS_LABEL_EM_DASH}</td>
                      <td className="max-w-[200px] px-4 py-2 text-slate-700">
                        <span className="break-words">{pay}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">{budgetDisp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {sorted.length > slice.length ? (
          <p className="mt-1.5 text-[10px] text-slate-500">
            Показано {numFmt.format(slice.length)} из {numFmt.format(sorted.length)} строк с данными покупателя.
          </p>
        ) : null}
      </div>
    </div>
  );
}
