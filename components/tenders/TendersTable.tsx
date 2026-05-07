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
import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  contractDeviationDays,
  mergeTenderSnapshotWithSeed,
  readTenderSnapshotFromStorage,
  TENDER_DATA,
  tenderLifecycleLabel,
  tenderTrafficFromContract,
  tenderTrafficLabel,
  writeTenderSnapshotToStorage,
  type Tender,
  type TenderProcurementStatus,
  type TenderTraffic,
} from "@/lib/tenderData";
import { normalizeTenderCsvRows, parseTenderCsvFile } from "@/lib/tenderCsvImport";
import { diffTendersImport, type TenderImportDiffStats } from "@/lib/tenderImportDiff";
import { formatStoredDateForUi } from "@/lib/ruIsoDate";
import { GprDateField } from "@/components/ui/GprDateField";
import { gprIssueStatusTitle } from "@/components/ui/GprRowIssueIndicator";
import {
  analyzeFourPlanFactDates,
  analyzeGprCodeInList,
  compareGprCodesByNumericPath,
  GPR_CODE_FORMAT_RE,
  gprCodeTreeIndentLevel,
  mergeGprRowIssues,
  normalizeGprCodeFinal,
  sanitizeGprCodeTyping,
  suggestNextCodeUnderParent,
} from "@/lib/gprUtils";

function sortTendersInPart(items: Tender[], partId: number): Tender[] {
  const rest = items.filter((t) => t.partId !== partId);
  const partRows = items.filter((t) => t.partId === partId);
  const sorted = [...partRows].sort(
    (a, b) => compareGprCodesByNumericPath(a.code, b.code) || a.id.localeCompare(b.id),
  );
  return [...rest, ...sorted];
}

function isoOrEmptyOk(s: string): boolean {
  const t = s.trim();
  return !t || /^\d{4}-\d{2}-\d{2}$/.test(t);
}

const COLORS: Record<TenderTraffic, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
};

const STATUS_OPTIONS: { value: TenderProcurementStatus; label: string }[] = [
  { value: "planned", label: "План" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Завершён" },
  { value: "delayed", label: "Задержка" },
];

type FormState = {
  id: string;
  partId: string;
  code: string;
  name: string;
  stage: string;
  planStart: string;
  factStart: string;
  planContractDate: string;
  factContractDate: string;
  cost: string;
  contractor: string;
  status: TenderProcurementStatus | "";
  comment: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  partId: "1",
  code: "",
  name: "",
  stage: "",
  planStart: "",
  factStart: "",
  planContractDate: "",
  factContractDate: "",
  cost: "",
  contractor: "",
  status: "",
  comment: "",
};

export type TendersTableHandle = {
  save: () => void;
  cancel: () => void;
};

type TendersTableProps = {
  embedded?: boolean;
  activePartId: number;
};

export const TendersTable = forwardRef<TendersTableHandle, TendersTableProps>(function TendersTable(
  { embedded = false, activePartId },
  ref,
) {
  const projectId = useMemo(() => getGprProjectId(), []);

  const [items, setItems] = useState<Tender[]>(() =>
    mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage(getGprProjectId())),
  );

  useEffect(() => {
    setItems(mergeTenderSnapshotWithSeed(readTenderSnapshotFromStorage(projectId)));
  }, [projectId]);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importStats, setImportStats] = useState<TenderImportDiffStats | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [trafficFilter, setTrafficFilter] = useState<"all" | TenderTraffic>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const rows = useMemo(() => {
    return items
      .filter((t) => t.partId === activePartId)
      .map((t) => {
        const deviation = contractDeviationDays(t);
        const traffic = tenderTrafficFromContract(t);
        return { ...t, deviation, traffic };
      });
  }, [items, activePartId]);

  const stageOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.stage));
    TENDER_DATA.filter((t) => t.partId === activePartId).forEach((t) => set.add(t.stage));
    return Array.from(set).sort(compareGprCodesByNumericPath);
  }, [rows, activePartId]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const byQuery =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        row.contractor?.toLowerCase().includes(q);
      const byStage = stageFilter === "all" || row.stage === stageFilter;
      const byTraffic = trafficFilter === "all" || row.traffic === trafficFilter;
      return byQuery && byStage && byTraffic;
    });
  }, [rows, query, stageFilter, trafficFilter]);

  const sortedFilteredRows = useMemo(() => {
    const out = [...filteredRows];
    out.sort((a, b) => {
      const c = compareGprCodesByNumericPath(a.code, b.code);
      if (c !== 0) return c;
      return a.id.localeCompare(b.id);
    });
    return out;
  }, [filteredRows]);

  const tenderCodesWithChildren = useMemo(() => {
    const codes = sortedFilteredRows.map((r) => r.code.trim());
    const hasChild = new Set<string>();
    for (const code of codes) {
      for (const other of codes) {
        if (other !== code && other.startsWith(`${code}.`)) {
          hasChild.add(code);
          break;
        }
      }
    }
    return hasChild;
  }, [sortedFilteredRows]);

  const tenderRowIssues = useMemo(() => {
    const m = new Map<string, { errors: string[]; warnings: string[] }>();
    const partPeers = items.filter((t) => t.partId === activePartId);
    for (const row of sortedFilteredRows) {
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList(row, partPeers),
        analyzeFourPlanFactDates({
          planStart: row.planStart,
          planEnd: row.planContractDate,
          factStart: row.factStart ?? null,
          factEnd: row.factContractDate ?? null,
        }),
      );
      if (merged.errors.length > 0 || merged.warnings.length > 0) m.set(row.id, merged);
    }
    return m;
  }, [sortedFilteredRows, items, activePartId]);

  const persist = useCallback(() => {
    if (typeof window === "undefined") return;
    for (const t of items) {
      const partPeers = items.filter((x) => x.partId === t.partId);
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList(t, partPeers),
        analyzeFourPlanFactDates({
          planStart: t.planStart,
          planEnd: t.planContractDate,
          factStart: t.factStart ?? null,
          factEnd: t.factContractDate ?? null,
        }),
      );
      if (merged.errors.length > 0) {
        window.alert(`Исправьте ошибки перед сохранением: ${t.code} — ${merged.errors.join("; ")}`);
        return;
      }
    }
    try {
      writeTenderSnapshotToStorage(projectId, items);
      window.dispatchEvent(new Event("gordo-tenders-saved"));
    } catch {
      /* ignore */
    }
  }, [items, projectId]);

  const handleTenderCsvImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const rows = await parseTenderCsvFile(file);
        const normalized = normalizeTenderCsvRows(rows);

        if (normalized.length === 0) {
          setImportStats({
            total: 0,
            added: 0,
            updated: 0,
            unchanged: 0,
            skippedInvalid: rows.length,
          });
          window.alert(
            "В файле нет строк с полями «Шифр» и «Наименование» (или некорректный формат).",
          );
          return;
        }

        const { result, stats } = diffTendersImport(items, normalized, rows.length);
        setImportStats(stats);
        setItems(result);
        writeTenderSnapshotToStorage(projectId, result);
        window.dispatchEvent(new Event("gordo-tenders-saved"));
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "Не удалось разобрать CSV.");
      }
    },
    [projectId, items],
  );

  const resetToSeed = useCallback(() => {
    setItems((prev) => {
      const rest = prev.filter((t) => t.partId !== activePartId);
      const seed = TENDER_DATA.filter((t) => t.partId === activePartId).map((t) => ({ ...t }));
      return [...rest, ...seed];
    });
  }, [activePartId]);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToSeed }), [persist, resetToSeed]);

  const openCreate = () => {
    setEditingId(null);
    const stage = activePartId === 2 ? "2.06" : "2.05";
    const codes = items.filter((t) => t.partId === activePartId).map((t) => t.code);
    const suggested = suggestNextCodeUnderParent(codes, stage);
    setForm({
      ...EMPTY_FORM,
      id: `tender-${Date.now()}`,
      partId: String(activePartId),
      stage,
      code: suggested,
    });
    setIsModalOpen(true);
  };

  const openEdit = (row: Tender) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      partId: String(row.partId),
      code: row.code,
      name: row.name,
      stage: row.stage,
      planStart: row.planStart ?? "",
      factStart: row.factStart ?? "",
      planContractDate: row.planContractDate ?? "",
      factContractDate: row.factContractDate ?? "",
      cost: row.cost != null ? String(row.cost) : "",
      contractor: row.contractor ?? "",
      status: row.status ?? "",
      comment: row.comment ?? "",
    });
    setIsModalOpen(true);
  };

  const removeItem = (id: string) => {
    if (!window.confirm("Удалить тендер из реестра?")) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const saveForm = () => {
    if (!form.name.trim() || !form.stage.trim()) return;
    const code = normalizeGprCodeFinal(form.code);
    if (!code || !GPR_CODE_FORMAT_RE.test(code)) {
      window.alert("Укажите корректный шифр (цифры и точки).");
      return;
    }
    if (
      !isoOrEmptyOk(form.planStart) ||
      !isoOrEmptyOk(form.planContractDate) ||
      !isoOrEmptyOk(form.factStart) ||
      !isoOrEmptyOk(form.factContractDate)
    ) {
      window.alert("Даты должны быть пустыми или в формате ГГГГ-ММ-ДД.");
      return;
    }
    const partId = Number(form.partId) === 2 ? 2 : 1;
    const probeId = form.id || `tender-${Date.now()}`;
    const peers = items.filter((t) => t.partId === partId && t.id !== editingId);
    const probeRow: Tender = {
      id: probeId,
      partId,
      code,
      name: form.name.trim(),
      stage: form.stage.trim(),
      planStart: form.planStart.trim() || null,
      factStart: form.factStart.trim() || null,
      planContractDate: form.planContractDate.trim() || null,
      factContractDate: form.factContractDate.trim() || null,
      cost: form.cost.trim() ? Number(form.cost.replace(/\s/g, "")) || undefined : undefined,
      contractor: form.contractor.trim() || undefined,
      status: form.status || undefined,
      comment: form.comment.trim() || undefined,
    };
    const merged = mergeGprRowIssues(
      analyzeGprCodeInList(probeRow, [...peers, probeRow]),
      analyzeFourPlanFactDates({
        planStart: probeRow.planStart,
        planEnd: probeRow.planContractDate,
        factStart: probeRow.factStart,
        factEnd: probeRow.factContractDate,
      }),
    );
    if (merged.errors.length > 0) {
      window.alert(merged.errors.join("\n"));
      return;
    }

    const payload: Tender = { ...probeRow, id: editingId ?? (form.id || probeId) };

    setItems((prev) => {
      const next = editingId
        ? prev.map((x) => (x.id === editingId ? payload : x))
        : [payload, ...prev];
      return sortTendersInPart(next, partId);
    });
    setIsModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const shellClass = embedded ? "space-y-6" : "rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-sm";

  return (
    <section className={shellClass}>
      {!embedded ? (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Закупка услуг (тендеры)</h2>
          <p className="mt-1 text-xs text-slate-600">
            Реестр привязан к этапам ГПР; отклонение считается по датам договора (факт − план).
          </p>
        </div>
      ) : null}

      <div className={`rounded-xl border border-slate-200 bg-white p-3 ${embedded ? "" : "mt-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(ev) => void handleTenderCsvImport(ev)}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Импорт CSV
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Добавить тендер
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: код, название, подрядчик"
            className="h-10 min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Все этапы</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                Этап {s}
              </option>
            ))}
          </select>
          <select
            value={trafficFilter}
            onChange={(e) => setTrafficFilter(e.target.value as "all" | TenderTraffic)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Все по договору</option>
            <option value="green">В срок</option>
            <option value="yellow">Риск</option>
            <option value="red">Отставание</option>
            <option value="gray">Нет договора</option>
          </select>
        </div>
        {importStats ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Файл: {importStats.total} записей после разбора.
            {importStats.skippedInvalid > 0 ? (
              <> Пропущено строк без шифра/наименования: {importStats.skippedInvalid}.</>
            ) : null}{" "}
            Обновлено: {importStats.updated}, добавлено: {importStats.added}, без изменений:{" "}
            {importStats.unchanged}.
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1100px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-2 py-2">Код</th>
              <th className="px-2 py-2">Наименование</th>
              <th className="px-2 py-2">Этап ГПР</th>
              <th className="px-2 py-2">Цикл</th>
              <th className="px-2 py-2">План начала</th>
              <th className="px-2 py-2">Факт начала</th>
              <th className="px-2 py-2">План договора</th>
              <th className="px-2 py-2">Факт договора</th>
              <th className="px-2 py-2">Откл., дн</th>
              <th className="px-2 py-2">Стоимость</th>
              <th className="px-2 py-2">Статус</th>
              <th className="px-2 py-2">Комментарий</th>
              <th className="px-2 py-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredRows.map((row) => {
              const statusColor = COLORS[row.traffic];
              const trafficLbl = tenderTrafficLabel(row.traffic);
              const codeTrim = row.code.trim();
              const indentPx = gprCodeTreeIndentLevel(row.code) * 16;
              const isParentRow = tenderCodesWithChildren.has(codeTrim);
              const rowIssues = tenderRowIssues.get(row.id);
              return (
                <tr
                  key={row.id}
                  className={`rounded-lg border text-slate-800 shadow-sm ${
                    isParentRow
                      ? "border-slate-300 bg-slate-50/95 font-semibold"
                      : "border-slate-200 bg-white font-normal"
                  }`}
                >
                  <td className="rounded-l-lg px-2 py-2 font-mono text-xs">
                    <span className="inline-block tabular-nums" style={{ paddingLeft: indentPx }}>
                      {row.code}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-2 py-2 break-words">
                    <span className="inline-block" style={{ paddingLeft: indentPx }}>
                      <span className={isParentRow ? "font-semibold text-slate-900" : "font-medium text-slate-800"}>
                        {row.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-600">{row.stage}</td>
                  <td className="px-2 py-2 text-xs text-slate-700">{tenderLifecycleLabel(row)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.planStart)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.factStart)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.planContractDate)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.factContractDate)}</td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: statusColor }}>
                    {row.deviation === null ? "—" : row.deviation > 0 ? `+${row.deviation}` : row.deviation}
                  </td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                    {row.cost != null ? `${(row.cost / 1_000_000).toFixed(2)} млн` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-flex cursor-default rounded-full px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${statusColor}22`, color: statusColor }}
                      title={gprIssueStatusTitle(rowIssues)}
                    >
                      {trafficLbl}
                    </span>
                    {row.status ? (
                      <div className="mt-1 text-[10px] text-slate-500">
                        {STATUS_OPTIONS.find((o) => o.value === row.status)?.label ?? row.status}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[160px] px-2 py-2 text-xs text-slate-600 break-words">
                    {row.comment ?? "—"}
                  </td>
                  <td className="rounded-r-lg px-2 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      ✏️
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => removeItem(row.id)}
                      className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "Редактировать тендер" : "Добавить тендер"}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: sanitizeGprCodeTyping(e.target.value) }))}
                onBlur={() => setForm((p) => ({ ...p, code: normalizeGprCodeFinal(p.code) }))}
                placeholder="Шифр (2.05.05.1)"
                className="h-10 rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900"
              />
              <input
                value={form.stage}
                onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}
                placeholder="Этап ГПР (2.05)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Наименование работ"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 md:col-span-2"
              />
              <GprDateField
                value={form.planStart}
                onIso={(iso) => setForm((p) => ({ ...p, planStart: iso }))}
                title="План начала (необязательно)"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.factStart}
                onIso={(iso) => setForm((p) => ({ ...p, factStart: iso }))}
                title="Факт начала (опц.)"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.planContractDate}
                onIso={(iso) => setForm((p) => ({ ...p, planContractDate: iso }))}
                title="План даты договора (необязательно)"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <GprDateField
                value={form.factContractDate}
                onIso={(iso) => setForm((p) => ({ ...p, factContractDate: iso }))}
                title="Факт даты договора (опц.)"
                fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <input
                value={form.cost}
                onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
                placeholder="Стоимость (руб.)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <input
                value={form.contractor}
                onChange={(e) => setForm((p) => ({ ...p, contractor: e.target.value }))}
                placeholder="Подрядчик (опц.)"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              />
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({ ...p, status: e.target.value as TenderProcurementStatus | "" }))
                }
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              >
                <option value="">Статус процесса (опц.)</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={form.partId}
                onChange={(e) => setForm((p) => ({ ...p, partId: e.target.value }))}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
              >
                <option value="1">Жилой дом</option>
                <option value="2">Автостоянка</option>
              </select>
              <textarea
                value={form.comment}
                onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                placeholder="Комментарий"
                rows={2}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 md:col-span-2"
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
