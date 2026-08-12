"use client";

import { buildApiUrl, fetchAuthorizedApi } from "@/lib/apiClient";
import {
  gprTaskFromApiItem,
  gprTaskToApiWritePayload,
  type GprTaskApiItem,
  type GPRTask,
} from "@/lib/gprUtils";
import { syncTmcFinancials, categorizeTmcStatus, type TMCItem, type TmcSupplyStatus } from "@/lib/tmcData";
import {
  normalizeTenderCycleStatus,
  type Tender,
  type TenderProcurementStatus,
} from "@/lib/tenderData";

async function apiJsonError(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const body = (await res.json()) as { detail?: string };
    if (typeof body.detail === "string" && body.detail.trim()) detail = body.detail;
  } catch {
    /* ignore */
  }
  throw new Error(detail);
}

// ─── ГПР ───────────────────────────────────────────────────────────────────

export async function listGprTasksFromDb(
  token: string,
  partId?: number,
  projectId?: string,
): Promise<GPRTask[]> {
  const params = new URLSearchParams();
  if (partId != null) params.set("part_id", String(partId));
  if (projectId) params.set("projectId", projectId);
  const q = params.toString() ? `?${params}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить задачи ГПР");
  const rows = (await res.json()) as GprTaskApiItem[];
  return rows.map((r) => gprTaskFromApiItem(r));
}

export async function bulkImportGprTasksToDb(
  token: string,
  tasks: GPRTask[],
  projectId?: string,
): Promise<GPRTask[]> {
  const payload = {
    tasks: tasks.map((t) => gprTaskToApiWritePayload(t)),
    replace_missing: true,
    projectId: projectId ?? undefined,
  };
  const res = await fetchAuthorizedApi(buildApiUrl("/gpr/tasks/bulk-import"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await apiJsonError(res, "Не удалось сохранить импорт ГПР");
  const rows = (await res.json()) as GprTaskApiItem[];
  return rows.map((r) => gprTaskFromApiItem(r));
}

// ─── Тендеры ───────────────────────────────────────────────────────────────

export type TenderApiItem = {
  id: number;
  part_id: number;
  code: string;
  name: string;
  stage: string;
  plan_start: string;
  fact_start: string | null;
  plan_contract_date: string;
  fact_contract_date: string | null;
  cost: number | null;
  contractor: string | null;
  status: string | null;
  comment: string | null;
};

export function tenderFromApiItem(row: TenderApiItem): Tender {
  const st = (row.status ?? "").trim();
  const isLegacy =
    st === "planned" || st === "in_progress" || st === "completed" || st === "delayed";
  const status: TenderProcurementStatus | undefined = isLegacy ? st : undefined;
  const statusLabel = !isLegacy && st ? st : undefined;
  const cycleStatus = statusLabel ? normalizeTenderCycleStatus(statusLabel) : undefined;
  return {
    id: String(row.id),
    partId: row.part_id,
    code: row.code,
    name: row.name,
    stage: row.stage,
    planStart: row.plan_start?.trim() || null,
    factStart: row.fact_start?.trim() || undefined,
    planContractDate: row.plan_contract_date?.trim() || null,
    factContractDate: row.fact_contract_date?.trim() || undefined,
    cost: row.cost ?? undefined,
    contractor: row.contractor ?? undefined,
    status,
    statusLabel,
    cycleStatus: cycleStatus !== "other" ? cycleStatus : undefined,
    comment: row.comment ?? undefined,
  };
}

export function tenderToApiPayload(t: Tender) {
  const statusForDb = t.statusLabel?.trim() || t.status || null;
  return {
    part_id: t.partId,
    code: t.code,
    name: t.name,
    stage: t.stage,
    plan_start: t.planStart?.trim() || "",
    fact_start: t.factStart?.trim() || null,
    plan_contract_date: t.planContractDate?.trim() || "",
    fact_contract_date: t.factContractDate?.trim() || null,
    cost: t.cost ?? null,
    contractor: t.contractor ?? null,
    status: statusForDb,
    comment: t.comment ?? null,
  };
}

export async function listTendersFromDb(
  token: string,
  partId?: number,
  projectId?: string,
): Promise<Tender[]> {
  const params = new URLSearchParams();
  if (partId != null) params.set("part_id", String(partId));
  if (projectId) params.set("projectId", projectId);
  const q = params.toString() ? `?${params}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/tender${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить тендеры");
  const rows = (await res.json()) as TenderApiItem[];
  return rows.map(tenderFromApiItem);
}

export async function bulkImportTendersToDb(
  token: string,
  tenders: Tender[],
  projectId?: string,
): Promise<Tender[]> {
  const res = await fetchAuthorizedApi(buildApiUrl("/tender/bulk-import"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenders: tenders.map(tenderToApiPayload),
      replace_missing: true,
      projectId: projectId ?? undefined,
    }),
  });
  if (!res.ok) await apiJsonError(res, "Не удалось сохранить импорт тендеров");
  const rows = (await res.json()) as TenderApiItem[];
  return rows.map(tenderFromApiItem);
}

// ─── ТМЦ ───────────────────────────────────────────────────────────────────

export type TmcApiItem = {
  external_id: string;
  project_part: "residential" | "parking";
  name: string;
  gpr_stage: string;
  plan_cost: number;
  fact_cost: number | null;
  plan_date: string;
  fact_date: string | null;
  details?: Record<string, unknown> | null;
};

function parseTmcSupplyStatus(raw: unknown): TmcSupplyStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s.includes("поставлен") || s === "delivered") return "поставлено";
  if (s.includes("частич") || s === "partial") return "частично";
  return "план";
}

export function tmcFromApiItem(row: TmcApiItem): TMCItem {
  const d = row.details ?? {};
  const num = (k: string, fallback = 0) => {
    const v = d[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const numOrNull = (k: string): number | null => {
    const v = d[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = (k: string, fallback = "") => {
    const v = d[k];
    return typeof v === "string" ? v : fallback;
  };
  const iso = (k: string): string | null => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const externalId = row.external_id ?? "";
  const stage = row.gpr_stage ?? str("stage") ?? "";
  const statusRaw = str("statusRaw") || str("status") || "";
  const deliveryPlanDate = iso("deliveryPlanDate") || iso("supplyPlanDate") || row.plan_date || null;
  const deliveryFactDate = iso("deliveryFactDate") || iso("supplyFactDate") || row.fact_date || null;
  const plannedQuantity = numOrNull("plannedQuantity") ?? num("volumePlan");
  const actualQuantity = numOrNull("actualQuantity") ?? num("volumeFact");
  const rowKind =
    d.rowKind === "section" || d.rowKind === "group" || d.rowKind === "position" || d.rowKind === "other"
      ? d.rowKind
      : row.name?.trim()
        ? "position"
        : "other";
  const statusCategory =
    d.statusCategory === "delivered" ||
    d.statusCategory === "partial" ||
    d.statusCategory === "plan" ||
    d.statusCategory === "no_fact"
      ? d.statusCategory
      : undefined;

  const draft: TMCItem = {
    id: externalId,
    sourceRowNumber: num("sourceRowNumber"),
    rowNo: (() => {
      const n = numOrNull("rowNo");
      return n != null && n > 0 ? Math.trunc(n) : null;
    })(),
    sourceCode: str("sourceCode") || str("itemCode"),
    itemCode: str("itemCode") || str("sourceCode"),
    rowKind,
    parentWbsCode: str("parentWbsCode") || null,
    stage,
    gprStage: stage,
    name: row.name ?? "",
    gprStartDate: iso("gprStartDate"),
    orderDeadlineDays: numOrNull("orderDeadlineDays"),
    requestPlanDate: iso("requestPlanDate"),
    requestFactDate: iso("requestFactDate"),
    requestDeviationDays: numOrNull("requestDeviationDays"),
    contractLeadTimeDays: numOrNull("contractLeadTimeDays"),
    contractPlanDate: iso("contractPlanDate"),
    contractFactDate: iso("contractFactDate"),
    contractDeviationDays: numOrNull("contractDeviationDays"),
    deliveryPlanDate: deliveryPlanDate?.trim() || null,
    deliveryFactDate: deliveryFactDate?.trim() || null,
    deliveryDeviationDays: numOrNull("deliveryDeviationDays"),
    contractDate2PlanDate: iso("contractDate2PlanDate"),
    contractDate2FactDate: iso("contractDate2FactDate"),
    contractDate2DeviationDays: numOrNull("contractDate2DeviationDays"),
    unit: str("unit"),
    plannedQuantity,
    actualQuantity,
    quantityDeviation: numOrNull("quantityDeviation"),
    supplier: str("supplier"),
    contract: str("contract"),
    statusRaw,
    statusCategory: (statusCategory ?? categorizeTmcStatus(statusRaw)) as TMCItem["statusCategory"],
    status: parseTmcSupplyStatus(statusRaw || statusCategory || "план"),
    comment: str("comment"),
    projectPart: row.project_part,
    volumePlan: plannedQuantity ?? 0,
    volumeFact: actualQuantity ?? 0,
    supplyPlanDate: deliveryPlanDate?.trim() || null,
    supplyFactDate: deliveryFactDate?.trim() || null,
    pricePlan: 0,
    priceFact: 0,
    totalPlan: 0,
    totalFact: 0,
    planCost: 0,
    factCost: null,
  };
  return syncTmcFinancials(draft);
}

export function tmcToApiPayload(item: TMCItem): TmcApiItem {
  const synced = syncTmcFinancials(item);
  const planDate =
    synced.deliveryPlanDate?.trim() ||
    synced.supplyPlanDate?.trim() ||
    synced.contractPlanDate?.trim() ||
    "";
  const factDate =
    synced.deliveryFactDate?.trim() ||
    synced.supplyFactDate?.trim() ||
    synced.contractFactDate?.trim() ||
    null;
  return {
    external_id: synced.id,
    project_part: synced.projectPart,
    name: synced.name,
    gpr_stage: synced.stage || synced.gprStage,
    plan_cost: 0,
    fact_cost: null,
    plan_date: planDate,
    fact_date: factDate,
    details: {
      sourceRowNumber: synced.sourceRowNumber,
      rowNo: synced.rowNo,
      sourceCode: synced.sourceCode,
      itemCode: synced.itemCode,
      rowKind: synced.rowKind,
      parentWbsCode: synced.parentWbsCode,
      stage: synced.stage,
      unit: synced.unit,
      plannedQuantity: synced.plannedQuantity,
      actualQuantity: synced.actualQuantity,
      quantityDeviation: synced.quantityDeviation,
      volumePlan: synced.volumePlan,
      volumeFact: synced.volumeFact,
      supplier: synced.supplier,
      contract: synced.contract,
      status: synced.status,
      statusRaw: synced.statusRaw,
      statusCategory: synced.statusCategory,
      comment: synced.comment,
      gprStartDate: synced.gprStartDate,
      orderDeadlineDays: synced.orderDeadlineDays,
      requestPlanDate: synced.requestPlanDate,
      requestFactDate: synced.requestFactDate,
      requestDeviationDays: synced.requestDeviationDays,
      contractLeadTimeDays: synced.contractLeadTimeDays,
      contractPlanDate: synced.contractPlanDate,
      contractFactDate: synced.contractFactDate,
      contractDeviationDays: synced.contractDeviationDays,
      deliveryPlanDate: synced.deliveryPlanDate,
      deliveryFactDate: synced.deliveryFactDate,
      deliveryDeviationDays: synced.deliveryDeviationDays,
      supplyPlanDate: synced.supplyPlanDate,
      supplyFactDate: synced.supplyFactDate,
      contractDate2PlanDate: synced.contractDate2PlanDate,
      contractDate2FactDate: synced.contractDate2FactDate,
      contractDate2DeviationDays: synced.contractDate2DeviationDays,
    },
  };
}

export async function listTmcFromDb(
  token: string,
  projectPart?: "residential" | "parking",
  projectId?: string,
): Promise<TMCItem[]> {
  const params = new URLSearchParams();
  if (projectPart) params.set("project_part", projectPart);
  if (projectId) params.set("projectId", projectId);
  const q = params.toString() ? `?${params}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/tmc${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить ТМЦ");
  const rows = (await res.json()) as TmcApiItem[];
  return rows.map(tmcFromApiItem);
}

export async function bulkImportTmcToDb(
  token: string,
  items: TMCItem[],
  projectId?: string,
): Promise<TMCItem[]> {
  const res = await fetchAuthorizedApi(buildApiUrl("/tmc/bulk-import"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map(tmcToApiPayload),
      replace_missing: true,
      projectId: projectId ?? undefined,
    }),
  });
  if (!res.ok) await apiJsonError(res, "Не удалось сохранить импорт ТМЦ");
  const rows = (await res.json()) as TmcApiItem[];
  return rows.map(tmcFromApiItem);
}
