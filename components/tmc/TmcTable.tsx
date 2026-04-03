"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { getStatusByDeviation, partIdToProjectPartKey, type ProjectPartKey } from "@/lib/gprUtils";
import {
  mergeTmcSnapshotWithSeed,
  TMC_DATA,
  type TMCItem,
} from "@/lib/tmcData";

type Traffic = "green" | "yellow" | "red" | "gray" | "overdue_not_started";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  overdue_not_started: "#dc2626",
} as const;

function ms(iso: string | null) {
  if (!iso) return null;
  const value = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function deviationDays(item: TMCItem): number | null {
  const p = ms(item.planDate);
  if (p === null) return null;
  const f = ms(item.factDate);
  if (f === null) return null;
  return Math.round((f - p) / (1000 * 60 * 60 * 24));
}

function statusOf(item: TMCItem): Traffic {
  if (!item.factDate) {
    const p = ms(item.planDate);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (p !== null && p < todayStart) return "overdue_not_started";
    return "gray";
  }
  const d = deviationDays(item);
  if (d === null) return "gray";
  return getStatusByDeviation(d) as Traffic;
}

type EditableTmc = {
  id: string;
  name: string;
  gprStage: string;
  planDate: string;
  planCost: string;
  factDate: string;
  factCost: string;
};

const EMPTY_FORM: EditableTmc = {
  id: "",
  name: "",
  gprStage: "",
  planDate: "",
  planCost: "",
  factDate: "",
  factCost: "",
};

export type TmcTableHandle = {
  save: () => void;
  cancel: () => void;
};

type TmcTableProps = {
  /** Внутри EditLayout: без заголовка и внешней «карточки» */
  embedded?: boolean;
  /** Текущая часть проекта: новые ТМЦ и список привязываются к ней. */
  activePartId: number;
};

function readStoredTmcSnapshot(): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("gordo_tmc_snapshot");
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export const TmcTable = forwardRef<TmcTableHandle, TmcTableProps>(function TmcTable(
  { embedded = false, activePartId },
  ref,
) {
  const activeProjectPart: ProjectPartKey = partIdToProjectPartKey(activePartId);

  const [items, setItems] = useState<TMCItem[]>(() =>
    mergeTmcSnapshotWithSeed(readStoredTmcSnapshot()),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Traffic>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableTmc>(EMPTY_FORM);

  const rows = useMemo(
    () =>
      items
        .filter((item) => item.projectPart === activeProjectPart)
        .map((item) => {
          const deviation = deviationDays(item);
          const status = statusOf(item);
          return { ...item, deviation, status };
        }),
    [items, activeProjectPart],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const byQuery = row.name.toLowerCase().includes(query.trim().toLowerCase());
      const byStatus = statusFilter === "all" ? true : row.status === statusFilter;
      return byQuery && byStatus;
    });
  }, [rows, query, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    const prefix = activeProjectPart === "parking" ? "tmc-p-" : "tmc-";
    setForm({ ...EMPTY_FORM, id: `${prefix}${Date.now()}` });
    setIsModalOpen(true);
  };

  const openEdit = (row: TMCItem) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      name: row.name,
      gprStage: row.gprStage,
      planDate: row.planDate,
      planCost: String(row.planCost),
      factDate: row.factDate ?? "",
      factCost: row.factCost === null ? "" : String(row.factCost),
    });
    setIsModalOpen(true);
  };

  const removeItem = (id: string) => {
    const ok = window.confirm("Удалить позицию ТМЦ?");
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const persist = useCallback(() => {
    try {
      localStorage.setItem("gordo_tmc_snapshot", JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const resetToSeed = useCallback(() => {
    setItems((prev) => {
      const rest = prev.filter((x) => x.projectPart !== activeProjectPart);
      const seedForPart = TMC_DATA.filter((x) => x.projectPart === activeProjectPart);
      return [...rest, ...seedForPart];
    });
  }, [activeProjectPart]);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToSeed }), [persist, resetToSeed]);

  const saveForm = () => {
    if (!form.name.trim() || !form.gprStage.trim() || !form.planDate || !form.planCost.trim()) return;
    const payload: TMCItem = {
      id: form.id || `tmc-${Date.now()}`,
      name: form.name.trim(),
      gprStage: form.gprStage.trim(),
      planDate: form.planDate,
      planCost: Number(form.planCost) || 0,
      factDate: form.factDate.trim() || null,
      factCost: form.factCost.trim() ? Number(form.factCost) || 0 : null,
      projectPart: editingId
        ? items.find((x) => x.id === editingId)?.projectPart ?? activeProjectPart
        : activeProjectPart,
    };

    setItems((prev) =>
      editingId ? prev.map((x) => (x.id === editingId ? payload : x)) : [payload, ...prev],
    );
    setIsModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const shellClass = embedded
    ? "space-y-6"
    : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";

  return (
    <section className={shellClass}>
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900">Закупка ТМЦ</h2>
          <p className="mt-1 text-xs text-slate-600">
            Рабочий режим: позиции привязаны к выбранной части проекта (
            {activeProjectPart === "residential" ? "жилой дом" : "автостоянка"}).
          </p>
        </>
      ) : null}

      <div className={`rounded-xl border border-slate-200 bg-white p-3 ${embedded ? "" : "mt-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Добавить ТМЦ
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию"
            className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Traffic)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Все статусы</option>
            <option value="green">В срок</option>
            <option value="yellow">Риск</option>
            <option value="red">Отставание</option>
            <option value="overdue_not_started">Не закуплено</option>
            <option value="gray">Нет данных</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Этап ГПР</th>
              <th className="px-3 py-2">План дата</th>
              <th className="px-3 py-2">Факт дата</th>
              <th className="px-3 py-2">План стоимость</th>
              <th className="px-3 py-2">Факт стоимость</th>
              <th className="px-3 py-2">Отклонение</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const statusColor = COLORS[row.status];
              const statusLabel =
                row.status === "green"
                  ? "В срок"
                  : row.status === "yellow"
                    ? "Риск"
                    : row.status === "overdue_not_started"
                      ? "Не закуплено"
                    : row.status === "red"
                      ? "Отставание"
                      : "Нет данных";
              const statusNote =
                row.status === "overdue_not_started"
                  ? "Срок закупки истёк, фактическая дата отсутствует"
                  : null;
              return (
                <tr key={row.id} className="rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm">
                  <td className="rounded-l-lg px-3 py-3 font-medium">{row.name}</td>
                  <td className="px-3 py-3 text-slate-600">{row.gprStage}</td>
                  <td className="px-3 py-3">{row.planDate}</td>
                  <td className="px-3 py-3">{row.factDate ?? "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{(row.planCost / 1_000_000).toFixed(2)} млн</td>
                  <td className="px-3 py-3 tabular-nums">{row.factCost === null ? "—" : `${(row.factCost / 1_000_000).toFixed(2)} млн`}</td>
                  <td className="px-3 py-3 tabular-nums" style={{ color: statusColor }}>
                    {row.deviation === null ? "—" : row.deviation > 0 ? `+${row.deviation} дн` : `${row.deviation} дн`}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        row.status === "overdue_not_started" ? "ring-1 ring-red-300" : ""
                      }`}
                      style={{
                        backgroundColor: `${statusColor}22`,
                        color: statusColor,
                        fontWeight: row.status === "overdue_not_started" ? 700 : 500,
                      }}
                    >
                      {statusLabel}
                    </span>
                    {statusNote ? <div className="mt-1 text-[11px] text-red-700">{statusNote}</div> : null}
                  </td>
                  <td className="rounded-r-lg px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(row.id)}
                        className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "Редактировать ТМЦ" : "Добавить ТМЦ"}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Название"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.gprStage}
                onChange={(e) => setForm((p) => ({ ...p, gprStage: e.target.value }))}
                placeholder="Этап ГПР"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.planDate}
                onChange={(e) => setForm((p) => ({ ...p, planDate: e.target.value }))}
                placeholder="План дата (YYYY-MM-DD)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.factDate}
                onChange={(e) => setForm((p) => ({ ...p, factDate: e.target.value }))}
                placeholder="Факт дата (опц.)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.planCost}
                onChange={(e) => setForm((p) => ({ ...p, planCost: e.target.value }))}
                placeholder="План стоимость"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.factCost}
                onChange={(e) => setForm((p) => ({ ...p, factCost: e.target.value }))}
                placeholder="Факт стоимость (опц.)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveForm}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

