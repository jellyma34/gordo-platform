"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  compareGprCodesByNumericPath,
  partIdToProjectPartKey,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { useAuth } from "@/components/auth/AuthProvider";
import { bulkImportTmcToDb, listTmcFromDb } from "@/lib/constructionApi";
import { isGprLocalStorageMode } from "@/lib/gprStorageMode";
import {
  getGprProjectId,
  loadPersistedTmcItems,
  postTmcImportToApi,
  saveTmcTasksToLocalStorage,
} from "@/lib/tmcImportPersistence";
import { importTmcProcurementCsvFile } from "@/lib/tmcCsvImport";
import { diffTmcImport, type TmcImportDiffStats } from "@/lib/tmcImportDiff";
import {
  createEmptyTmcItem,
  syncTmcFinancials,
  tmcDisplayWorkId,
  type TMCItem,
  type TmcStatusCategory,
} from "@/lib/tmcData";
import {
  formatTmcDeviationDays,
  formatTmcIsoRu,
  tmcDateDeviationTone,
} from "@/lib/tmcProcurementAnalytics";
import { formatStoredDateForUi } from "@/lib/ruIsoDate";
import { GprDateField } from "@/components/ui/GprDateField";

function parseDecimalInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function deviationClass(days: number | null | undefined, forQuantity = false): string {
  if (forQuantity) return "text-slate-600";
  const tone = tmcDateDeviationTone(days);
  if (tone === "danger") return "font-semibold text-rose-600";
  if (tone === "ok") return "text-emerald-600";
  if (tone === "early") return "text-emerald-700";
  return "text-slate-500";
}

type EditableTmc = {
  id: string;
  itemCode: string;
  stage: string;
  name: string;
  gprStartDate: string;
  requestPlanDate: string;
  requestFactDate: string;
  contractPlanDate: string;
  contractFactDate: string;
  deliveryPlanDate: string;
  deliveryFactDate: string;
  unit: string;
  plannedQuantity: string;
  actualQuantity: string;
  supplier: string;
  contract: string;
  statusRaw: string;
  comment: string;
};

const EMPTY_FORM: EditableTmc = {
  id: "",
  itemCode: "",
  stage: "",
  name: "",
  gprStartDate: "",
  requestPlanDate: "",
  requestFactDate: "",
  contractPlanDate: "",
  contractFactDate: "",
  deliveryPlanDate: "",
  deliveryFactDate: "",
  unit: "",
  plannedQuantity: "",
  actualQuantity: "",
  supplier: "",
  contract: "",
  statusRaw: "",
  comment: "",
};

export type TmcTableHandle = {
  save: () => void;
  cancel: () => void;
};

type TmcTableProps = {
  embedded?: boolean;
  activePartId: number;
  compactHeaders?: boolean;
};

function sortTmcInPart(items: TMCItem[], part: ProjectPartKey): TMCItem[] {
  const rest = items.filter((x) => x.projectPart !== part);
  const partRows = items.filter((x) => x.projectPart === part);
  const sorted = [...partRows].sort((a, b) => {
    const rowCmp = (a.sourceRowNumber || 0) - (b.sourceRowNumber || 0);
    if (rowCmp !== 0) return rowCmp;
    const codeCmp = compareGprCodesByNumericPath(a.itemCode ?? "", b.itemCode ?? "");
    if (codeCmp !== 0) return codeCmp;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
  return [...rest, ...sorted];
}

function toForm(item: TMCItem): EditableTmc {
  return {
    id: item.id,
    itemCode: item.itemCode || item.sourceCode || "",
    stage: item.stage || item.gprStage || "",
    name: item.name || "",
    gprStartDate: item.gprStartDate || "",
    requestPlanDate: item.requestPlanDate || "",
    requestFactDate: item.requestFactDate || "",
    contractPlanDate: item.contractPlanDate || "",
    contractFactDate: item.contractFactDate || "",
    deliveryPlanDate: item.deliveryPlanDate || item.supplyPlanDate || "",
    deliveryFactDate: item.deliveryFactDate || item.supplyFactDate || "",
    unit: item.unit || "",
    plannedQuantity: item.plannedQuantity != null ? String(item.plannedQuantity) : "",
    actualQuantity: item.actualQuantity != null ? String(item.actualQuantity) : "",
    supplier: item.supplier || "",
    contract: item.contract || "",
    statusRaw: item.statusRaw || "",
    comment: item.comment || "",
  };
}

function fromForm(form: EditableTmc, base: TMCItem, part: ProjectPartKey): TMCItem {
  const plannedQuantity = parseDecimalInput(form.plannedQuantity);
  const actualQuantity = parseDecimalInput(form.actualQuantity);
  return syncTmcFinancials({
    ...base,
    projectPart: part,
    itemCode: form.itemCode.trim(),
    sourceCode: form.itemCode.trim() || base.sourceCode,
    stage: form.stage.trim(),
    gprStage: form.stage.trim(),
    name: form.name.trim(),
    gprStartDate: form.gprStartDate.trim() || null,
    requestPlanDate: form.requestPlanDate.trim() || null,
    requestFactDate: form.requestFactDate.trim() || null,
    contractPlanDate: form.contractPlanDate.trim() || null,
    contractFactDate: form.contractFactDate.trim() || null,
    deliveryPlanDate: form.deliveryPlanDate.trim() || null,
    deliveryFactDate: form.deliveryFactDate.trim() || null,
    supplyPlanDate: form.deliveryPlanDate.trim() || null,
    supplyFactDate: form.deliveryFactDate.trim() || null,
    unit: form.unit.trim(),
    plannedQuantity,
    actualQuantity,
    volumePlan: plannedQuantity ?? 0,
    volumeFact: actualQuantity ?? 0,
    supplier: form.supplier.trim(),
    contract: form.contract.trim(),
    statusRaw: form.statusRaw.trim(),
    comment: form.comment.trim(),
    rowKind: form.name.trim() ? "position" : base.rowKind === "group" ? "group" : "position",
  });
}

const tmcLocalMode = isGprLocalStorageMode();

function statusBadge(category: TmcStatusCategory, raw: string) {
  const label = raw.trim() || category;
  const cls =
    category === "delivered"
      ? "bg-emerald-50 text-emerald-800"
      : category === "partial"
        ? "bg-amber-50 text-amber-800"
        : category === "plan"
          ? "bg-sky-50 text-sky-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label || "—"}
    </span>
  );
}

export const TmcTable = forwardRef<TmcTableHandle, TmcTableProps>(function TmcTable(
  { embedded = false, activePartId },
  ref,
) {
  const activeProjectPart: ProjectPartKey = partIdToProjectPartKey(activePartId);
  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);

  const [items, setItems] = useState<TMCItem[]>([]);
  const [baseline, setBaseline] = useState<TMCItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableTmc>(EMPTY_FORM);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<TmcImportDiffStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const persist = useCallback(
    async (next: TMCItem[]) => {
      const sorted = sortTmcInPart(next, activeProjectPart);
      if (tmcLocalMode) {
        // Только явный test/local adapter — не SoT для приложения.
        setItems(sorted);
        saveTmcTasksToLocalStorage(projectId, sorted);
        await postTmcImportToApi(projectId, sorted);
        window.dispatchEvent(new Event("gordo-tmc-saved"));
        return;
      }
      if (!token) {
        throw new Error("Требуется авторизация для сохранения ТМЦ в PostgreSQL");
      }
      await bulkImportTmcToDb(token, sorted, projectId);
      const rows = await listTmcFromDb(token, undefined, projectId);
      const fromServer = sortTmcInPart(rows, activeProjectPart);
      setItems(fromServer);
      setBaseline(fromServer);
      window.dispatchEvent(new Event("gordo-tmc-saved"));
    },
    [activeProjectPart, projectId, token],
  );

  const reload = useCallback(async () => {
    if (tmcLocalMode) {
      const r = await loadPersistedTmcItems(projectId);
      const sorted = sortTmcInPart(r.items, activeProjectPart);
      setItems(sorted);
      setBaseline(sorted);
      return;
    }
    if (!hydrated || !token) return;
    const rows = await listTmcFromDb(token, undefined, projectId);
    const sorted = sortTmcInPart(rows, activeProjectPart);
    setItems(sorted);
    setBaseline(sorted);
  }, [activeProjectPart, hydrated, projectId, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const partItems = useMemo(
    () => items.filter((i) => i.projectPart === activeProjectPart),
    [items, activeProjectPart],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = Date.now();
    return partItems.filter((p) => {
      if (p.rowKind === "section") return false;
      if (statusFilter !== "all" && p.statusCategory !== statusFilter) return false;
      if (overdueOnly) {
        const late =
          (p.deliveryDeviationDays != null && p.deliveryDeviationDays > 0) ||
          Boolean(
            (p.deliveryPlanDate || p.supplyPlanDate) &&
              !(p.deliveryFactDate || p.supplyFactDate) &&
              new Date(`${p.deliveryPlanDate || p.supplyPlanDate}T12:00:00`).getTime() < today,
          );
        if (!late) return false;
      }
      if (!q) return true;
      const hay = [p.itemCode, p.sourceCode, p.stage, p.name, p.supplier, p.contract]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [partItems, search, statusFilter, overdueOnly]);

  const handleImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      setImportMsg(null);
      try {
        const imported = await importTmcProcurementCsvFile(file);
        if (imported.reportDate) {
          try {
            window.localStorage.setItem("tmc_report_date", imported.reportDate);
          } catch {
            /* ignore */
          }
        }
        const scoped = imported.items;
        const peersOther = items.filter((x) => x.projectPart !== activeProjectPart);
        // Импорт содержит обе части проекта — заменяем реестр целиком.
        const { result, stats } = diffTmcImport(items, scoped, imported.meta.dataRowCount);
        const merged = result.length > 0 ? result : [...peersOther, ...scoped];
        await persist(merged);
        setImportStats(stats);
        setImportMsg(
          [
            `Импорт «${file.name}»`,
            imported.reportDate ? `отчётная дата ${formatTmcIsoRu(imported.reportDate)}` : null,
            `строк: ${imported.importedRows}`,
            `позиций: ${imported.positionCount}`,
            `групп: ${imported.groupCount}`,
            `ошибок: ${imported.errorRows}`,
            `пропущено пустых: ${imported.skippedEmptyRows}`,
            `добавлено: ${stats.added}, обновлено: ${stats.updated}, без изменений: ${stats.unchanged}`,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } catch (err) {
        setImportMsg(err instanceof Error ? err.message : "Ошибка импорта CSV");
        // Не оставляем неподтверждённые данные в UI — откат к серверу / baseline.
        if (!tmcLocalMode) {
          try {
            await reload();
          } catch {
            /* ignore */
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [activeProjectPart, items, persist, reload],
  );

  const startEdit = (item: TMCItem) => {
    setEditingId(item.id);
    setForm(toForm(item));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const base = items.find((x) => x.id === editingId);
    if (!base) return;
    const nextItem = fromForm(form, base, activeProjectPart);
    const next = items.map((x) => (x.id === editingId ? nextItem : x));
    await persist(next);
    setBaseline(next);
    cancelEdit();
  };

  const removeItem = async (id: string) => {
    const next = items.filter((x) => x.id !== id);
    await persist(next);
    setBaseline(next);
  };

  const addRow = async () => {
    const created = createEmptyTmcItem(activeProjectPart, {
      rowKind: "position",
      stage: "",
      name: "Новая позиция ТМЦ",
    });
    const next = [...items, created];
    await persist(next);
    setBaseline(next);
    startEdit(created);
  };

  useImperativeHandle(ref, () => ({
    save: () => {
      void (async () => {
        await persist(items);
        setBaseline(items);
      })();
    },
    cancel: () => {
      setItems(baseline);
      cancelEdit();
    },
  }));

  const th = "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500";
  const td = "px-2 py-2 align-top text-xs text-slate-700";

  return (
    <div className={embedded ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Импорт CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImport}
        />
        <button
          type="button"
          onClick={() => void addRow()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Добавить позицию
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск: код, этап, ТМЦ, поставщик, договор"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">Все статусы</option>
          <option value="delivered">Поставлено</option>
          <option value="partial">Частично</option>
          <option value="plan">План</option>
          <option value="no_fact">Нет факта</option>
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          С просрочкой
        </label>
      </div>

      {importMsg ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {importMsg}
          {importStats ? (
            <div className="mt-1 text-xs text-slate-500">
              diff: +{importStats.added} / ~{importStats.updated} / ={importStats.unchanged}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1400px] border-collapse">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              <th className={th} rowSpan={2}>
                Код
              </th>
              <th className={th} rowSpan={2}>
                Этап работ
              </th>
              <th className={th} rowSpan={2}>
                Наименование ТМЦ
              </th>
              <th className={th} rowSpan={2}>
                Начало ГПР
              </th>
              <th className={`${th} border-l border-slate-200 text-center`} colSpan={3}>
                Заявка
              </th>
              <th className={`${th} border-l border-slate-200 text-center`} colSpan={3}>
                Договор
              </th>
              <th className={`${th} border-l border-slate-200 text-center`} colSpan={3}>
                Поставка
              </th>
              <th className={`${th} border-l border-slate-200 text-center`} colSpan={3}>
                Объём
              </th>
              <th className={th} rowSpan={2}>
                Поставщик
              </th>
              <th className={th} rowSpan={2}>
                Договор
              </th>
              <th className={th} rowSpan={2}>
                Статус
              </th>
              <th className={th} rowSpan={2}>
                Комментарий
              </th>
              <th className={th} rowSpan={2}>
                Действия
              </th>
            </tr>
            <tr className="border-b border-slate-200">
              {["План", "Факт", "Откл.", "План", "Факт", "Откл.", "План", "Факт", "Откл.", "План", "Факт", "Откл."].map(
                (label, i) => (
                  <th key={`${label}-${i}`} className={`${th} border-l border-slate-100`}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={20} className="px-4 py-10 text-center text-sm text-slate-500">
                  Нет данных. Импортируйте файл «ТМЦ_новое.csv».
                </td>
              </tr>
            ) : (
              visible.map((item) => {
                const isGroup = item.rowKind === "group";
                const editing = editingId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-100 ${isGroup ? "bg-slate-50/80" : "bg-white"}`}
                  >
                    <td className={`${td} font-mono text-[11px] ${isGroup ? "font-semibold" : ""}`}>
                      {editing ? (
                        <input
                          className="w-24 rounded border border-slate-300 px-1 py-0.5"
                          value={form.itemCode}
                          onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))}
                        />
                      ) : (
                        tmcDisplayWorkId(item)
                      )}
                    </td>
                    <td className={`${td} max-w-[160px]`}>
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-1 py-0.5"
                          value={form.stage}
                          onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                        />
                      ) : (
                        <span className="line-clamp-2">{item.stage || item.gprStage || "—"}</span>
                      )}
                    </td>
                    <td className={`${td} max-w-[180px] font-medium text-slate-900`}>
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-1 py-0.5"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      ) : (
                        <span className="line-clamp-2">{item.name || (isGroup ? "—" : "—")}</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Начало ГПР"
                          value={form.gprStartDate}
                          onIso={(v) => setForm((f) => ({ ...f, gprStartDate: v }))}
                        />
                      ) : (
                        formatStoredDateForUi(item.gprStartDate) || "—"
                      )}
                    </td>
                    {/* Заявка */}
                    <td className={`${td} border-l border-slate-100 whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Заявка план"
                          value={form.requestPlanDate}
                          onIso={(v) => setForm((f) => ({ ...f, requestPlanDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.requestPlanDate)
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Заявка факт"
                          value={form.requestFactDate}
                          onIso={(v) => setForm((f) => ({ ...f, requestFactDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.requestFactDate)
                      )}
                    </td>
                    <td className={`${td} tabular-nums ${deviationClass(item.requestDeviationDays)}`}>
                      {formatTmcDeviationDays(item.requestDeviationDays)}
                    </td>
                    {/* Договор */}
                    <td className={`${td} border-l border-slate-100 whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Договор план"
                          value={form.contractPlanDate}
                          onIso={(v) => setForm((f) => ({ ...f, contractPlanDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.contractPlanDate)
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Договор факт"
                          value={form.contractFactDate}
                          onIso={(v) => setForm((f) => ({ ...f, contractFactDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.contractFactDate)
                      )}
                    </td>
                    <td className={`${td} tabular-nums ${deviationClass(item.contractDeviationDays)}`}>
                      {formatTmcDeviationDays(item.contractDeviationDays)}
                    </td>
                    {/* Поставка */}
                    <td className={`${td} border-l border-slate-100 whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Поставка план"
                          value={form.deliveryPlanDate}
                          onIso={(v) => setForm((f) => ({ ...f, deliveryPlanDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.deliveryPlanDate ?? item.supplyPlanDate)
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {editing ? (
                        <GprDateField
                          title="Поставка факт"
                          value={form.deliveryFactDate}
                          onIso={(v) => setForm((f) => ({ ...f, deliveryFactDate: v }))}
                        />
                      ) : (
                        formatTmcIsoRu(item.deliveryFactDate ?? item.supplyFactDate)
                      )}
                    </td>
                    <td className={`${td} tabular-nums ${deviationClass(item.deliveryDeviationDays)}`}>
                      {formatTmcDeviationDays(item.deliveryDeviationDays)}
                    </td>
                    {/* Объём */}
                    <td className={`${td} border-l border-slate-100 tabular-nums`}>
                      {editing ? (
                        <input
                          className="w-20 rounded border border-slate-300 px-1 py-0.5"
                          value={form.plannedQuantity}
                          onChange={(e) => setForm((f) => ({ ...f, plannedQuantity: e.target.value }))}
                        />
                      ) : (
                        fmtQty(item.plannedQuantity)
                      )}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {editing ? (
                        <input
                          className="w-20 rounded border border-slate-300 px-1 py-0.5"
                          value={form.actualQuantity}
                          onChange={(e) => setForm((f) => ({ ...f, actualQuantity: e.target.value }))}
                        />
                      ) : (
                        fmtQty(item.actualQuantity)
                      )}
                    </td>
                    <td className={`${td} tabular-nums ${deviationClass(item.quantityDeviation, true)}`}>
                      {item.quantityDeviation == null
                        ? "—"
                        : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(
                            item.quantityDeviation,
                          )}
                      {item.unit && !editing ? (
                        <span className="ml-1 text-[10px] text-slate-400">{item.unit}</span>
                      ) : null}
                    </td>
                    <td className={`${td} max-w-[120px]`}>
                      {editing ? (
                        <input
                          className="w-full rounded border border-slate-300 px-1 py-0.5"
                          value={form.supplier}
                          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                        />
                      ) : (
                        <span className="line-clamp-2">{item.supplier || "—"}</span>
                      )}
                    </td>
                    <td className={`${td} max-w-[120px]`}>
                      {editing ? (
                        <textarea
                          className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          rows={2}
                          value={form.contract}
                          onChange={(e) => setForm((f) => ({ ...f, contract: e.target.value }))}
                        />
                      ) : (
                        <span className="line-clamp-2 whitespace-pre-wrap">{item.contract || "—"}</span>
                      )}
                    </td>
                    <td className={td}>
                      {editing ? (
                        <input
                          className="w-28 rounded border border-slate-300 px-1 py-0.5"
                          value={form.statusRaw}
                          onChange={(e) => setForm((f) => ({ ...f, statusRaw: e.target.value }))}
                        />
                      ) : (
                        statusBadge(item.statusCategory, item.statusRaw)
                      )}
                    </td>
                    <td className={`${td} max-w-[140px]`}>
                      {editing ? (
                        <textarea
                          className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          rows={2}
                          value={form.comment}
                          onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                        />
                      ) : (
                        <span className="line-clamp-2 whitespace-pre-wrap text-slate-500">
                          {item.comment || "—"}
                        </span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {editing ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-slate-900 px-2 py-1 text-[11px] text-white"
                            onClick={() => void saveEdit()}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                            onClick={cancelEdit}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-[11px]"
                            onClick={() => startEdit(item)}
                          >
                            Изм.
                          </button>
                          <button
                            type="button"
                            className="rounded border border-rose-200 px-2 py-1 text-[11px] text-rose-700"
                            onClick={() => void removeItem(item.id)}
                          >
                            Удал.
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/** @deprecated старый риск по объёму — оставлен для совместимости импортов. */
export function procurementRiskFromVolumes(item: TMCItem): "green" | "yellow" | "red" {
  if (item.statusCategory === "delivered") return "green";
  if (item.statusCategory === "partial") return "yellow";
  return "red";
}
