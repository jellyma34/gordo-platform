"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listTmcFromDb } from "@/lib/constructionApi";
import { compareGprCodesByNumericPath, partIdToProjectPartKey } from "@/lib/gprUtils";
import type { TMCItem, TmcSupplyStatus } from "@/lib/tmcData";

function supplierBadge(status: TmcSupplyStatus): { label: string; bg: string; fg: string } {
  if (status === "поставлено") {
    return { label: "Поставлено", bg: "#dcfce7", fg: "#166534" };
  }
  if (status === "частично") {
    return { label: "Частично", bg: "#fef9c3", fg: "#854d0e" };
  }
  return { label: "План", bg: "#f3f4f6", fg: "#4b5563" };
}

function StatusBadge({ status }: { status: TmcSupplyStatus }) {
  const b = supplierBadge(status);
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: b.bg, color: b.fg }}
    >
      {b.label}
    </span>
  );
}

/** Только номер договора (фрагмент с № или длинная цифровая группа). */
export function contractNumberOnly(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "—";
  const hash = t.match(/№\s*[^\s,;]{1,48}/u);
  if (hash) return hash[0].replace(/\s+/g, " ").trim();
  const digits = t.match(/\d[\d\-\/]{4,}/);
  return digits ? digits[0] : "—";
}

function hasSupplierText(s: string): boolean {
  const trimmed = s.trim();
  return Boolean(trimmed && trimmed !== "-" && trimmed !== "—");
}

function groupItemsBySupplier(rows: TMCItem[]): Map<string, TMCItem[]> {
  const map = new Map<string, TMCItem[]>();
  for (const item of rows) {
    const key = item.supplier.trim();
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  for (const [, list] of map) {
    list.sort(
      (a, b) =>
        compareGprCodesByNumericPath(a.itemCode, b.itemCode) ||
        a.gprStage.localeCompare(b.gprStage, "ru") ||
        a.name.localeCompare(b.name, "ru"),
    );
  }
  const sortedKeys = [...map.keys()].sort((a, b) => a.localeCompare(b, "ru"));
  return new Map(sortedKeys.map((k) => [k, map.get(k)!]));
}

export type SuppliersBlockProps = {
  activePartId: 1 | 2;
  /** Переопределение данных (например режим презентации без общего стора таблицы). */
  items?: TMCItem[];
  variant?: "light" | "dark";
};

export function SuppliersBlock({ activePartId, items: itemsProp, variant = "light" }: SuppliersBlockProps) {
  const { token, hydrated } = useAuth();
  const part = partIdToProjectPartKey(activePartId);
  const [dbItems, setDbItems] = useState<TMCItem[]>([]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      setDbItems(await listTmcFromDb(token));
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    if (itemsProp != null) return;
    if (!hydrated || !token) return;
    void reload();
    const onSaved = () => void reload();
    window.addEventListener("gordo-tmc-saved", onSaved);
    return () => window.removeEventListener("gordo-tmc-saved", onSaved);
  }, [itemsProp, hydrated, token, reload]);

  const scopedItems = useMemo(() => {
    const raw = itemsProp ?? dbItems;
    if (itemsProp != null) return raw;
    return raw.filter((i) => i.projectPart === part);
  }, [part, itemsProp, dbItems]);

  const rowsWithSupplier = useMemo(
    () => scopedItems.filter((i) => hasSupplierText(i.supplier ?? "")),
    [scopedItems],
  );

  const grouped = useMemo(() => groupItemsBySupplier(rowsWithSupplier), [rowsWithSupplier]);

  const dark = variant === "dark";
  const shell =
    dark
      ? "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-5 shadow-sm"
      : "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

  const titleCls = dark ? "text-lg font-semibold text-slate-50" : "text-lg font-semibold text-slate-900";
  const emptyCls = dark ? "text-slate-400" : "text-slate-600";

  const thCls =
    dark
      ? "border-b border-slate-600/80 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"
      : "border-b border-slate-200 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  const supplierRowCls = dark
    ? "supplier-row border-t border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] font-semibold text-slate-100"
    : "supplier-row border-t border-slate-200 bg-slate-100 font-semibold text-slate-900";

  const tdBase =
    dark
      ? "border-b border-slate-700/50 px-4 py-3 text-sm text-slate-100"
      : "border-b border-slate-100 px-4 py-3 text-sm text-slate-900";

  const tdMuted = dark ? "text-slate-300" : "text-slate-600";

  const itemRowHover = dark ? "hover:bg-[rgba(255,255,255,0.03)]" : "hover:bg-slate-50";

  return (
    <section className={`mt-6 ${shell}`}>
      <h3 className={titleCls}>Поставщики</h3>
      {grouped.size === 0 ? (
        <p className={`mt-4 text-sm ${emptyCls}`}>Нет данных по поставщикам</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "25%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className={thCls}>Поставщик</th>
                <th className={thCls}>ТМЦ</th>
                <th className={thCls}>Этап ГПР</th>
                <th className={thCls}>Договор</th>
                <th className={thCls}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {[...grouped.entries()].map(([supplierName, items]) => (
                <Fragment key={supplierName}>
                  <tr className={supplierRowCls}>
                    <td colSpan={5} className="px-4 py-3 align-middle">
                      {supplierName}
                    </td>
                  </tr>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`align-middle transition-colors ${dark ? "text-slate-100" : "text-slate-900"} ${itemRowHover}`}
                    >
                      <td className={`${tdBase} min-w-0`} aria-hidden />
                      <td className={`${tdBase} min-w-0 font-medium`}>
                        <span className="line-clamp-3">{item.name}</span>
                      </td>
                      <td className={`${tdBase} min-w-0 text-xs ${tdMuted}`}>
                        <span className="line-clamp-3">{[item.itemCode, item.gprStage].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className={`${tdBase} min-w-0 truncate text-xs ${tdMuted}`} title={contractNumberOnly(item.contract)}>
                        {contractNumberOnly(item.contract)}
                      </td>
                      <td className={`${tdBase} whitespace-nowrap`}>
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
