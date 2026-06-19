"use client";

import {
  gprStageDependencyStatusColor,
  type GprStageLagCauseRow,
} from "@/lib/gprProcurementLagRisk";

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function fmtDeviation(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(Math.round(rounded))
    : rounded.toFixed(1).replace(".", ",");
  if (rounded > 0) return `+${text}%`;
  if (rounded < 0) return `${text}%`;
  return "0%";
}

function fmtLagPp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)} п.п.`;
  return `${rounded.toFixed(1).replace(".", ",")} п.п.`;
}

function fmtRemainingPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${Math.round(rounded)}%`;
  return `${rounded.toFixed(1).replace(".", ",")}%`;
}

function formatContractsCell(row: GprStageLagCauseRow): string {
  if (!row.contractsDataAvailable) return "Нет данных";
  if (row.unclosedContractCount <= 0) return "—";
  const count = row.unclosedContractCount;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "договор"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "договора"
        : "договоров";
  return `${count} незаключ. ${noun}`;
}

function DependencyStatusBadge({ row }: { row: GprStageLagCauseRow }) {
  const color = gprStageDependencyStatusColor(row.dependencyStatus);
  return (
    <span
      className="inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[10px] font-semibold leading-snug"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {row.dependencyLabel}
    </span>
  );
}

export function TmcGprStageLagCauseTable({ rows }: { rows: GprStageLagCauseRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-600/35 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
        Нет этапов ГПР для анализа причин отставания.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-600/45 bg-slate-950/40">
      <table className="w-full min-w-[960px] border-collapse text-left text-[11px]">
        <thead className="bg-slate-950/90 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Этап ГПР</th>
            <th className="px-3 py-2.5 font-semibold">План</th>
            <th className="px-3 py-2.5 font-semibold">Факт</th>
            <th className="px-3 py-2.5 font-semibold">Отклонение</th>
            <th className="min-w-[140px] px-3 py-2.5 font-semibold">Причина</th>
            <th className="min-w-[160px] px-3 py-2.5 font-semibold">ТМЦ</th>
            <th className="px-3 py-2.5 font-semibold">Договоры</th>
            <th className="min-w-[150px] px-3 py-2.5 font-semibold">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lagVisible = row.lagPp > 0;
            return (
              <tr
                key={row.rowKey}
                className="border-t border-slate-700/35 text-slate-300 transition-colors hover:bg-slate-800/25"
              >
                <td className="max-w-[200px] px-3 py-2.5 align-top">
                  <div className="font-semibold tabular-nums text-slate-100">{row.stageCode}</div>
                  <div className="mt-0.5 line-clamp-2 break-words text-[10px] leading-snug text-slate-400">
                    {row.stageTitle}
                  </div>
                  {lagVisible ? (
                    <div className="mt-1 text-[10px] font-medium tabular-nums text-rose-300">
                      Отставание: {fmtLagPp(row.lagPp)}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums">{fmtPct(row.planPct)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums">{fmtPct(row.factPct)}</td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 align-top tabular-nums font-medium ${
                    row.deviationPct !== null && row.deviationPct < 0
                      ? "text-rose-300"
                      : row.deviationPct !== null && row.deviationPct > 0
                        ? "text-emerald-300"
                        : ""
                  }`}
                >
                  {fmtDeviation(row.deviationPct)}
                </td>
                <td className="px-3 py-2.5 align-top text-[10px] leading-snug text-slate-200">
                  {row.causeLabel}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {!row.tmcLinkDefined ? (
                    <span className="text-[10px] text-slate-500">Связь не определена</span>
                  ) : row.tmcDeficits.length === 0 ? (
                    <span className="text-[10px] text-slate-500">—</span>
                  ) : (
                    <ul className="space-y-1 text-[10px] leading-snug">
                      {row.tmcDeficits.map((item) => (
                        <li key={`${row.rowKey}|${item.material}`} className="break-words">
                          <span className="text-slate-200">{item.material}</span>
                          <span className="ml-1 tabular-nums font-semibold text-amber-200">
                            — {fmtRemainingPercent(item.remainingPercent)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top text-[10px] tabular-nums">
                  {formatContractsCell(row)}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <DependencyStatusBadge row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
