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
  analyzeFourPlanFactDates,
  analyzeGprCodeInList,
  compareGprCodesByNumericPath,
  getStatusByDeviation,
  GPR_CODE_FORMAT_RE,
  mergeGprRowIssues,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  sanitizeGprCodeTyping,
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
import { normalizeTmcCsvRows, parseTmcCsvFile } from "@/lib/tmcCsvImport";
import { diffTmcImport, type TmcImportDiffStats } from "@/lib/tmcImportDiff";
import {
  computeTmcTotalsFromVolumes,
  suggestNextTmcItemCode,
  syncTmcFinancials,
  TMC_DATA,
  tmcFactReferenceDate,
  tmcPlanReferenceDate,
  type TMCItem,
  type TmcSupplyStatus,
} from "@/lib/tmcData";
import { formatStoredDateForUi } from "@/lib/ruIsoDate";
import { useAppMode } from "@/components/mode/ModeProvider";
import { GprDateField } from "@/components/ui/GprDateField";
import { gprIssueStatusTitle } from "@/components/ui/GprRowIssueIndicator";

type Traffic = "green" | "yellow" | "red" | "gray" | "overdue_not_started";

/** Риск закупки по фактам (объём / сумма) и сравнению с планом. */
type ProcurementRisk = "green" | "yellow" | "red";

const COLORS = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  gray: "#6b7280",
  overdue_not_started: "#dc2626",
} as const;

function parseDecimalInput(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function fmtRubCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return `${(n / 1_000_000).toFixed(2)} млн`;
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

function fmtPriceRub(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

/** Подсказки для шапки: как в Excel/PDF + понятные формулировки для презентации. */
const TMC_HEAD_HELP = {
  code: "Код позиции ТМЦ в иерархии ГПР (шифр).",
  name: "Наименование материала или услуги.",
  stage: "Этап производства работ по справочнику ГПР.",
  grpSupply: "Сроки поставки материала на объект (план и факт).",
  supplyPlan:
    "Дата поставки (план) — запланированная дата поставки ТМЦ на объект или на склад.",
  supplyFact: "Дата поставки (факт) — фактическая дата поставки ТМЦ.",
  grpContract: "Даты заключения договора с поставщиком (план и факт).",
  contractPlan: "Дата договора (план) — когда планируется подписание договора.",
  contractFact: "Дата договора (факт) — дата заключённого договора.",
  grpVolume: "Объёмы закупки в выбранной единице измерения (как в реестре PDF).",
  volumePlan: "Объем (план) — запланированное количество.",
  volumeFact: "Объем (факт) — фактически поставленное количество.",
  grpPrice: "Цена за единицу номенклатуры без учёта итоговой суммы строки.",
  pricePlan: "Цена за ед. (план) — плановая цена закупки за единицу.",
  priceFact: "Цена за ед. (факт) — фактическая цена за единицу.",
  grpCost: "Стоимость строки: объём × цена (пересчитывается автоматически).",
  costPlan: "Стоимость (план) — плановая сумма по строке.",
  costFact: "Стоимость (факт) — фактическая сумма по строке.",
  unit: "Единица измерения (кг, м³, шт и т.п.), как в реестре ТМЦ.",
  supplier: "Поставщик или контрагент по строке.",
  contractNo: "Номер и примечание к договору с поставщиком.",
  deviation: "Отклонение фактической опорной даты от плановой, в календарных днях.",
  traffic:
    "Закуплено / частично / не закуплено — по фактическому объёму и сумме относительно плана (без учёта поставщика и договора).",
  actions: "Редактировать или удалить строку.",
} as const;

function ms(iso: string | null | undefined) {
  if (!iso?.trim()) return null;
  const value = new Date(`${iso.trim()}T00:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function deviationDays(item: TMCItem): number | null {
  const pr = tmcPlanReferenceDate(item);
  const fr = tmcFactReferenceDate(item);
  if (!pr || !fr) return null;
  const p = ms(pr);
  const f = ms(fr);
  if (p === null || f === null) return null;
  return Math.round((f - p) / (1000 * 60 * 60 * 24));
}

function statusOf(item: TMCItem): Traffic {
  const factRef = tmcFactReferenceDate(item);
  if (!factRef) {
    const planRef = tmcPlanReferenceDate(item);
    if (!planRef) return "gray";
    const p = ms(planRef);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (p !== null && p < todayStart) return "overdue_not_started";
    return "gray";
  }
  const d = deviationDays(item);
  if (d === null) return "gray";
  return getStatusByDeviation(d) as Traffic;
}

/**
 * Риск закупки: только volumeFact / volumePlan и factCost (не supplier, не contract).
 */
export function procurementRiskFromVolumes(item: TMCItem): ProcurementRisk {
  const hasFact =
    (item.volumeFact > 0) || (item.factCost != null && item.factCost > 0);
  const hasPlan = item.volumePlan > 0;

  if (!hasFact) return "red";

  if (hasFact && hasPlan && item.volumeFact < item.volumePlan) {
    return "yellow";
  }

  return "green";
}

type EditableTmc = {
  id: string;
  itemCode: string;
  name: string;
  gprStage: string;
  unit: string;
  volumePlan: string;
  volumeFact: string;
  pricePlan: string;
  priceFact: string;
  supplier: string;
  contract: string;
  status: TmcSupplyStatus;
  supplyPlanDate: string;
  supplyFactDate: string;
  contractPlanDate: string;
  contractFactDate: string;
};

const EMPTY_FORM: EditableTmc = {
  id: "",
  itemCode: "",
  name: "",
  gprStage: "",
  unit: "",
  volumePlan: "",
  volumeFact: "",
  pricePlan: "",
  priceFact: "",
  supplier: "",
  contract: "",
  status: "план",
  supplyPlanDate: "",
  supplyFactDate: "",
  contractPlanDate: "",
  contractFactDate: "",
};

export type TmcTableHandle = {
  save: () => void;
  cancel: () => void;
};

type TmcTableProps = {
  embedded?: boolean;
  activePartId: number;
  /**
   * Короткие групповые заголовки и подписи «План» / «Факт» в подстроке (удобно для презентации).
   * Если не задано — берётся из режима: `presentation` → компактно, иначе полные названия как в Excel.
   */
  compactHeaders?: boolean;
};

function sortTmcInPart(items: TMCItem[], part: ProjectPartKey): TMCItem[] {
  const rest = items.filter((x) => x.projectPart !== part);
  const partRows = items.filter((x) => x.projectPart === part);
  const sorted = [...partRows].sort((a, b) => {
    const codeCmp = compareGprCodesByNumericPath(a.itemCode ?? "", b.itemCode ?? "");
    if (codeCmp !== 0) return codeCmp;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
  return [...rest, ...sorted];
}

function isoOrEmptyOk(s: string): boolean {
  const t = s.trim();
  return !t || /^\d{4}-\d{2}-\d{2}$/.test(t);
}

const tmcLocalMode = isGprLocalStorageMode();

export const TmcTable = forwardRef<TmcTableHandle, TmcTableProps>(function TmcTable(
  { embedded = false, activePartId, compactHeaders: compactHeadersProp },
  ref,
) {
  const { mode } = useAppMode();
  const compactHeaders =
    compactHeadersProp !== undefined ? compactHeadersProp : mode === "presentation";

  const activeProjectPart: ProjectPartKey = partIdToProjectPartKey(activePartId);

  const { token, hydrated } = useAuth();
  const projectId = useMemo(() => getGprProjectId(), []);

  const [items, setItems] = useState<TMCItem[]>(() =>
    tmcLocalMode ? TMC_DATA.map((x) => ({ ...x })) : [],
  );
  const lastSavedTmcJsonRef = useRef<string | null>(null);
  const [tmcPersistReady, setTmcPersistReady] = useState(!tmcLocalMode);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importStats, setImportStats] = useState<TmcImportDiffStats | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProcurementRisk>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditableTmc>(EMPTY_FORM);

  useEffect(() => {
    if (tmcLocalMode) {
      lastSavedTmcJsonRef.current = null;
      setTmcPersistReady(false);
      let cancelled = false;
      (async () => {
        try {
          const r = await loadPersistedTmcItems(projectId);
          if (cancelled) return;
          setItems(r.items);
          lastSavedTmcJsonRef.current = r.bootstrapJson;
        } catch (e) {
          console.error(e);
        } finally {
          if (!cancelled) setTmcPersistReady(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (!hydrated || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listTmcFromDb(token);
        if (!cancelled) setItems(rows);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmcLocalMode, hydrated, token, projectId]);

  useEffect(() => {
    if (!tmcLocalMode || !tmcPersistReady || typeof window === "undefined") return;
    try {
      const next = JSON.stringify(items);
      if (next === lastSavedTmcJsonRef.current) return;
      lastSavedTmcJsonRef.current = next;
      saveTmcTasksToLocalStorage(projectId, items);
      void postTmcImportToApi(projectId, items);
    } catch (e) {
      console.error(e);
    }
  }, [items, tmcPersistReady, projectId]);

  const rows = useMemo(
    () =>
      items
        .filter((item) => item.projectPart === activeProjectPart)
        .map((item) => {
          const deviation = deviationDays(item);
          const scheduleTraffic = statusOf(item);
          const procurementRisk = procurementRiskFromVolumes(item);
          return { ...item, deviation, scheduleTraffic, procurementRisk };
        }),
    [items, activeProjectPart],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const byQuery =
        !q ||
        (row.name ?? "").toLowerCase().includes(q) ||
        (row.itemCode ?? "").toLowerCase().includes(q) ||
        (row.gprStage ?? "").toLowerCase().includes(q);
      const byStatus = statusFilter === "all" ? true : row.procurementRisk === statusFilter;
      return byQuery && byStatus;
    });
  }, [rows, query, statusFilter]);

  const sortedFilteredRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const codeCmp = compareGprCodesByNumericPath(a.itemCode ?? "", b.itemCode ?? "");
      if (codeCmp !== 0) return codeCmp;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
  }, [filteredRows]);

  const tmcRowIssues = useMemo(() => {
    const m = new Map<string, { errors: string[]; warnings: string[] }>();
    const peers = items.filter((t) => t.projectPart === activeProjectPart);
    for (const row of sortedFilteredRows) {
      const rowAsCode = { id: row.id, code: row.itemCode };
      const peersAsCode = peers.map((t) => ({ id: t.id, code: t.itemCode }));
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList(rowAsCode, peersAsCode),
        analyzeFourPlanFactDates({
          planStart: row.supplyPlanDate,
          planEnd: row.contractPlanDate,
          factStart: row.supplyFactDate,
          factEnd: row.contractFactDate,
        }),
      );
      if (merged.errors.length > 0 || merged.warnings.length > 0) m.set(row.id, merged);
    }
    return m;
  }, [sortedFilteredRows, items, activeProjectPart]);

  const openCreate = () => {
    setEditingId(null);
    const prefix = activeProjectPart === "parking" ? "tmc-p-" : "tmc-";
    const id = `${prefix}${Date.now()}`;
    const suggested = suggestNextTmcItemCode(items, activeProjectPart, "Строительство зданий и сооружений");
    setForm({
      ...EMPTY_FORM,
      id,
      itemCode: suggested,
      gprStage: "Строительство зданий и сооружений",
    });
    setIsModalOpen(true);
  };

  const openEdit = (row: TMCItem) => {
    setEditingId(row.id);
    setForm({
      id: row.id,
      itemCode: row.itemCode,
      name: row.name,
      gprStage: row.gprStage,
      unit: row.unit ?? "",
      volumePlan: String(row.volumePlan ?? ""),
      volumeFact: String(row.volumeFact ?? ""),
      pricePlan: String(row.pricePlan ?? ""),
      priceFact: String(row.priceFact ?? ""),
      supplier: row.supplier ?? "",
      contract: row.contract ?? "",
      status: row.status ?? "план",
      supplyPlanDate: row.supplyPlanDate ?? "",
      supplyFactDate: row.supplyFactDate ?? "",
      contractPlanDate: row.contractPlanDate ?? "",
      contractFactDate: row.contractFactDate ?? "",
    });
    setIsModalOpen(true);
  };

  const removeItem = (id: string) => {
    const ok = window.confirm("Удалить позицию ТМЦ?");
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const persist = useCallback(async () => {
    const peers = items.filter((t) => t.projectPart === activeProjectPart);
    const asCodes = peers.map((t) => ({ id: t.id, code: t.itemCode }));
    for (const t of peers) {
      const merged = mergeGprRowIssues(
        analyzeGprCodeInList({ id: t.id, code: t.itemCode }, asCodes),
        analyzeFourPlanFactDates({
          planStart: t.supplyPlanDate,
          planEnd: t.contractPlanDate,
          factStart: t.supplyFactDate,
          factEnd: t.contractFactDate,
        }),
      );
      if (merged.errors.length > 0) {
        window.alert(`Исправьте ошибки перед сохранением: ${t.itemCode} — ${merged.errors.join("; ")}`);
        return;
      }
    }
    if (tmcLocalMode) {
      saveTmcTasksToLocalStorage(projectId, items);
      void postTmcImportToApi(projectId, items);
      window.dispatchEvent(new Event("gordo-tmc-saved"));
      return;
    }
    if (!token) {
      window.alert("Требуется авторизация для сохранения в БД");
      return;
    }
    try {
      const saved = await bulkImportTmcToDb(token, items);
      setItems(saved);
      window.dispatchEvent(new Event("gordo-tmc-saved"));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Не удалось сохранить ТМЦ");
    }
  }, [items, activeProjectPart, token, projectId]);

  const handleTmcCsvImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const { rows, headers } = await parseTmcCsvFile(file);
        const normalized = normalizeTmcCsvRows(rows, headers);
        console.log("Строк данных (после поиска шапки):", rows.length);
        console.log("После фильтра и группировки:", normalized.length);

        if (normalized.length === 0) {
          setImportStats({
            total: 0,
            added: 0,
            updated: 0,
            unchanged: 0,
            skippedInvalid: rows.length,
          });
          window.alert(
            "В файле нет строк с распознаваемым наименованием позиции (или некорректный формат). Смотрите консоль: CSV columns.",
          );
          return;
        }

        const scoped = normalized.map((row) => ({ ...row, projectPart: activeProjectPart }));
        const { result, stats } = diffTmcImport(items, scoped, rows.length);
        setImportStats(stats);
        setItems(result);
        if (tmcLocalMode) {
          saveTmcTasksToLocalStorage(projectId, result);
          void postTmcImportToApi(projectId, result);
        } else if (token) {
          const saved = await bulkImportTmcToDb(token, result);
          setItems(saved);
        } else {
          window.alert("Импорт отображён локально, но без авторизации не сохранён в БД");
        }
        window.dispatchEvent(new Event("gordo-tmc-saved"));
      } catch (err) {
        console.error(err);
        window.alert(err instanceof Error ? err.message : "Не удалось разобрать CSV.");
      }
    },
    [token, items, activeProjectPart, projectId],
  );

  const resetToSeed = useCallback(() => {
    setItems((prev) => {
      const rest = prev.filter((x) => x.projectPart !== activeProjectPart);
      const seedForPart = TMC_DATA.filter((x) => x.projectPart === activeProjectPart);
      return [...rest, ...seedForPart];
    });
  }, [activeProjectPart]);

  useImperativeHandle(ref, () => ({ save: persist, cancel: resetToSeed }), [persist, resetToSeed]);

  const saveForm = () => {
    if (!form.name.trim() || !form.gprStage.trim()) return;
    const itemCode = normalizeGprCodeFinal(form.itemCode);
    if (!itemCode || !GPR_CODE_FORMAT_RE.test(itemCode)) {
      window.alert("Укажите корректный код позиции (цифры и точки).");
      return;
    }
    if (
      !isoOrEmptyOk(form.supplyPlanDate) ||
      !isoOrEmptyOk(form.supplyFactDate) ||
      !isoOrEmptyOk(form.contractPlanDate) ||
      !isoOrEmptyOk(form.contractFactDate)
    ) {
      window.alert("Даты должны быть пустыми или в формате ГГГГ-ММ-ДД.");
      return;
    }

    const probeId = form.id || `tmc-${Date.now()}`;
    const peers = items.filter((x) => x.projectPart === activeProjectPart && x.id !== editingId);

    const vp = parseDecimalInput(form.volumePlan);
    const vf = parseDecimalInput(form.volumeFact);
    const pp = parseDecimalInput(form.pricePlan);
    const pf = parseDecimalInput(form.priceFact);
    const totals = computeTmcTotalsFromVolumes(vp, pp, vf, pf);

    const draft: TMCItem = {
      id: probeId,
      itemCode,
      name: form.name.trim(),
      gprStage: form.gprStage.trim(),
      unit: form.unit.trim(),
      volumePlan: vp,
      volumeFact: vf,
      pricePlan: pp,
      priceFact: pf,
      totalPlan: totals.totalPlan,
      totalFact: totals.totalFact,
      supplier: form.supplier.trim(),
      contract: form.contract.trim(),
      status: form.status,
      planCost: 0,
      factCost: null,
      supplyPlanDate: form.supplyPlanDate.trim() || null,
      supplyFactDate: form.supplyFactDate.trim() || null,
      contractPlanDate: form.contractPlanDate.trim() || null,
      contractFactDate: form.contractFactDate.trim() || null,
      projectPart: editingId
        ? items.find((x) => x.id === editingId)?.projectPart ?? activeProjectPart
        : activeProjectPart,
    };

    const probeRow = syncTmcFinancials(draft);

    const peersAsCode = peers.map((t) => ({ id: t.id, code: t.itemCode }));
    const merged = mergeGprRowIssues(
      analyzeGprCodeInList({ id: probeRow.id, code: probeRow.itemCode }, [
        ...peersAsCode,
        { id: probeRow.id, code: probeRow.itemCode },
      ]),
      analyzeFourPlanFactDates({
        planStart: probeRow.supplyPlanDate,
        planEnd: probeRow.contractPlanDate,
        factStart: probeRow.supplyFactDate,
        factEnd: probeRow.contractFactDate,
      }),
    );
    if (merged.errors.length > 0) {
      window.alert(merged.errors.join("\n"));
      return;
    }

    const payload: TMCItem = { ...probeRow, id: editingId ?? probeId };

    setItems((prev) => {
      const next = editingId
        ? prev.map((x) => (x.id === editingId ? payload : x))
        : [payload, ...prev];
      return sortTmcInPart(next, payload.projectPart);
    });
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
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(ev) => void handleTmcCsvImport(ev)}
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
            + Добавить ТМЦ
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: код, название, этап"
            className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | ProcurementRisk)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Все</option>
            <option value="green">Закуплено</option>
            <option value="yellow">Частично</option>
            <option value="red">Не закуплено</option>
          </select>
        </div>
        {importStats ? (
          <p className="mt-2 text-xs leading-snug text-slate-600">
            Файл: {importStats.total} записей после разбора.
            {importStats.skippedInvalid > 0 ? (
              <> Пропущено строк без наименования: {importStats.skippedInvalid}.</>
            ) : null}{" "}
            Обновлено: {importStats.updated}, добавлено: {importStats.added}, без изменений:{" "}
            {importStats.unchanged}.
          </p>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-xs text-slate-600">
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.code}
                className="sticky left-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 align-bottom font-semibold"
              >
                Код
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.name}
                className="min-w-[160px] border-b border-slate-200 px-2 py-2 align-bottom font-semibold"
              >
                Название
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.stage}
                className="min-w-[120px] border-b border-slate-200 px-2 py-2 align-bottom font-semibold"
              >
                Этап ГПР
              </th>
              <th
                colSpan={2}
                title={TMC_HEAD_HELP.grpSupply}
                className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
              >
                {compactHeaders ? "Дата пост." : "Дата поставки"}
              </th>
              <th
                colSpan={2}
                title={TMC_HEAD_HELP.grpContract}
                className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
              >
                {compactHeaders ? "Дата дог." : "Дата договора"}
              </th>
              <th
                colSpan={2}
                title={TMC_HEAD_HELP.grpVolume}
                className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
              >
                Объем
              </th>
              <th
                colSpan={2}
                title={TMC_HEAD_HELP.grpPrice}
                className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
              >
                Цена за ед.
              </th>
              <th
                colSpan={2}
                title={TMC_HEAD_HELP.grpCost}
                className="border-b border-slate-200 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide"
              >
                {compactHeaders ? "Сумма" : "Стоимость"}
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.unit}
                className="border-b border-slate-200 px-2 py-2 align-bottom font-semibold"
              >
                Ед.&nbsp;изм.
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.deviation}
                className="border-b border-slate-200 px-2 py-2 align-bottom font-semibold"
              >
                Отклонение
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.traffic}
                className="border-b border-slate-200 px-2 py-2 align-bottom font-semibold"
              >
                Риск
              </th>
              <th
                rowSpan={2}
                title={TMC_HEAD_HELP.actions}
                className="sticky right-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 text-right align-bottom font-semibold"
              >
                Действия
              </th>
            </tr>
            <tr className="text-[11px] font-medium text-slate-500">
              <th title={TMC_HEAD_HELP.supplyPlan} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                План
              </th>
              <th title={TMC_HEAD_HELP.supplyFact} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                Факт
              </th>
              <th title={TMC_HEAD_HELP.contractPlan} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                План
              </th>
              <th title={TMC_HEAD_HELP.contractFact} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                Факт
              </th>
              <th title={TMC_HEAD_HELP.volumePlan} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                План
              </th>
              <th title={TMC_HEAD_HELP.volumeFact} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                Факт
              </th>
              <th title={TMC_HEAD_HELP.pricePlan} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                План
              </th>
              <th title={TMC_HEAD_HELP.priceFact} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                Факт
              </th>
              <th title={TMC_HEAD_HELP.costPlan} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                План
              </th>
              <th title={TMC_HEAD_HELP.costFact} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5">
                Факт
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredRows.map((row) => {
              const deviationColor = COLORS[row.scheduleTraffic];
              const procurementColor = COLORS[row.procurementRisk];
              const procurementLabel =
                row.procurementRisk === "green"
                  ? "Закуплено"
                  : row.procurementRisk === "yellow"
                    ? "Частично"
                    : "Не закуплено";
              const rowIssues = tmcRowIssues.get(row.id);
              const statusTitle = gprIssueStatusTitle(rowIssues);
              return (
                <tr
                  key={row.id}
                  className="rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm"
                >
                  <td className="sticky left-0 z-[1] bg-white px-2 py-2 font-mono text-xs">{row.itemCode}</td>
                  <td className="px-2 py-2 font-medium">{row.name}</td>
                  <td className="px-2 py-2 text-slate-600">{row.gprStage}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.supplyPlanDate)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.supplyFactDate)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.contractPlanDate)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatStoredDateForUi(row.contractFactDate)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtQty(row.volumePlan)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtQty(row.volumeFact)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtPriceRub(row.pricePlan)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtPriceRub(row.priceFact)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtRubCompact(row.totalPlan)}</td>
                  <td className="px-2 py-2 tabular-nums text-xs">{fmtRubCompact(row.totalFact)}</td>
                  <td className="px-2 py-2 text-xs">{row.unit?.trim() || "—"}</td>
                  <td className="px-2 py-2 tabular-nums text-xs" style={{ color: deviationColor }}>
                    {row.deviation === null ? "—" : row.deviation > 0 ? `+${row.deviation} дн` : `${row.deviation} дн`}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="inline-flex cursor-default rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `${procurementColor}22`,
                        color: procurementColor,
                        fontWeight: 500,
                      }}
                      title={statusTitle}
                    >
                      {procurementLabel}
                    </span>
                  </td>
                  <td className="sticky right-0 z-[1] bg-white px-2 py-2 text-right">
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
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? "Редактировать ТМЦ" : "Добавить ТМЦ"}
              </h3>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  value={form.itemCode}
                  onChange={(e) => setForm((p) => ({ ...p, itemCode: sanitizeGprCodeTyping(e.target.value) }))}
                  onBlur={() => setForm((p) => ({ ...p, itemCode: normalizeGprCodeFinal(p.itemCode) }))}
                  placeholder="Код позиции (2.05.01.1)"
                  className="h-10 rounded-lg border border-slate-300 px-3 font-mono text-sm text-slate-900"
                />
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Название"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
                />
                <input
                  value={form.gprStage}
                  onChange={(e) => {
                    const gprStage = e.target.value;
                    setForm((p) => {
                      if (editingId) return { ...p, gprStage };
                      const sugg = suggestNextTmcItemCode(items, activeProjectPart, gprStage);
                      return { ...p, gprStage, itemCode: sugg };
                    });
                  }}
                  placeholder="Этап ГПР (подпись)"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 md:col-span-2"
                />
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">📦 Логистика</p>
              <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  Ед. изм.
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="кг, м³, шт"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Объём план
                  <input
                    value={form.volumePlan}
                    onChange={(e) => setForm((p) => ({ ...p, volumePlan: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs text-slate-600 md:col-span-2">
                  Объём факт
                  <input
                    value={form.volumeFact}
                    onChange={(e) => setForm((p) => ({ ...p, volumeFact: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">💰 Цены</p>
              <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  Цена (план), ₽ за ед.
                  <input
                    value={form.pricePlan}
                    onChange={(e) => setForm((p) => ({ ...p, pricePlan: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Цена (факт), ₽ за ед.
                  <input
                    value={form.priceFact}
                    onChange={(e) => setForm((p) => ({ ...p, priceFact: e.target.value }))}
                    placeholder="0"
                    inputMode="decimal"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">💰 Стоимость (авто)</p>
              <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                {(() => {
                  const vp = parseDecimalInput(form.volumePlan);
                  const vf = parseDecimalInput(form.volumeFact);
                  const pp = parseDecimalInput(form.pricePlan);
                  const pf = parseDecimalInput(form.priceFact);
                  const { totalPlan, totalFact } = computeTmcTotalsFromVolumes(vp, pp, vf, pf);
                  return (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>
                        Σ план:{" "}
                        <strong className="tabular-nums">{fmtRubCompact(totalPlan)}</strong>
                      </span>
                      <span>
                        Σ факт:{" "}
                        <strong className="tabular-nums">{fmtRubCompact(totalFact)}</strong>
                      </span>
                    </div>
                  );
                })()}
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">🏢 Контракт</p>
              <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-2">
                <label className="block text-xs text-slate-600 md:col-span-2">
                  Поставщик
                  <input
                    value={form.supplier}
                    onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                    placeholder="Напр. АО Темерсо"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs text-slate-600 md:col-span-2">
                  Договор (номер / реквизиты)
                  <input
                    value={form.contract}
                    onChange={(e) => setForm((p) => ({ ...p, contract: e.target.value }))}
                    placeholder="№ …"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <label className="block text-xs text-slate-600 md:col-span-2">
                  Статус поставки
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, status: e.target.value as TmcSupplyStatus }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="план">План</option>
                    <option value="поставлено">Поставлено</option>
                    <option value="частично">Частично</option>
                  </select>
                </label>
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">📅 Даты</p>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                <GprDateField
                  value={form.supplyPlanDate}
                  onIso={(iso) => setForm((p) => ({ ...p, supplyPlanDate: iso }))}
                  title="Дата поставки: план"
                  fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <GprDateField
                  value={form.supplyFactDate}
                  onIso={(iso) => setForm((p) => ({ ...p, supplyFactDate: iso }))}
                  title="Дата поставки: факт"
                  fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <GprDateField
                  value={form.contractPlanDate}
                  onIso={(iso) => setForm((p) => ({ ...p, contractPlanDate: iso }))}
                  title="Дата договора: план"
                  fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <GprDateField
                  value={form.contractFactDate}
                  onIso={(iso) => setForm((p) => ({ ...p, contractFactDate: iso }))}
                  title="Дата договора: факт"
                  fieldClassName="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4">
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
