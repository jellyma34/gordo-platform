"use client";

import { buildApiUrl, fetchAuthorizedApi } from "@/lib/apiClient";
import {
  gprTaskFromApiItem,
  gprTaskToApiWritePayload,
  type GprTaskApiItem,
  type GPRTask,
} from "@/lib/gprUtils";
import { syncTmcFinancials, type TMCItem, type TmcSupplyStatus } from "@/lib/tmcData";
import type { Tender, TenderProcurementStatus } from "@/lib/tenderData";

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

export async function listGprTasksFromDb(token: string, partId?: number): Promise<GPRTask[]> {
  const q = partId != null ? `?part_id=${partId}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/gpr/tasks${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить задачи ГПР");
  const rows = (await res.json()) as GprTaskApiItem[];
  return rows.map((r) => gprTaskFromApiItem(r));
}

export async function bulkImportGprTasksToDb(token: string, tasks: GPRTask[]): Promise<GPRTask[]> {
  const payload = {
    tasks: tasks.map((t) => gprTaskToApiWritePayload(t)),
    replace_missing: true,
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
  const st = row.status;
  const status: TenderProcurementStatus | undefined =
    st === "planned" || st === "in_progress" || st === "completed" || st === "delayed" ? st : undefined;
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
    comment: row.comment ?? undefined,
  };
}

export function tenderToApiPayload(t: Tender) {
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
    status: t.status ?? null,
    comment: t.comment ?? null,
  };
}

export async function listTendersFromDb(token: string, partId?: number): Promise<Tender[]> {
  const q = partId != null ? `?part_id=${partId}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/tender${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить тендеры");
  const rows = (await res.json()) as TenderApiItem[];
  return rows.map(tenderFromApiItem);
}

export async function bulkImportTendersToDb(token: string, tenders: Tender[]): Promise<Tender[]> {
  const res = await fetchAuthorizedApi(buildApiUrl("/tender/bulk-import"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenders: tenders.map(tenderToApiPayload),
      replace_missing: true,
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
  const str = (k: string, fallback = "") => {
    const v = d[k];
    return typeof v === "string" ? v : fallback;
  };
  const draft: TMCItem = {
    id: row.external_id,
    itemCode: str("itemCode", row.external_id),
    name: row.name,
    gprStage: row.gpr_stage,
    unit: str("unit", "шт"),
    volumePlan: num("volumePlan"),
    volumeFact: num("volumeFact"),
    pricePlan: num("pricePlan"),
    priceFact: num("priceFact"),
    totalPlan: num("totalPlan", row.plan_cost),
    totalFact: num("totalFact", row.fact_cost ?? 0),
    supplier: str("supplier"),
    contract: str("contract"),
    status: parseTmcSupplyStatus(d.status ?? "план"),
    planCost: row.plan_cost,
    factCost: row.fact_cost,
    supplyPlanDate: str("supplyPlanDate") || row.plan_date || null,
    supplyFactDate: str("supplyFactDate") || row.fact_date || null,
    contractPlanDate: str("contractPlanDate") || null,
    contractFactDate: str("contractFactDate") || null,
    projectPart: row.project_part,
  };
  return syncTmcFinancials(draft);
}

export function tmcToApiPayload(item: TMCItem): TmcApiItem {
  const synced = syncTmcFinancials(item);
  const planDate =
    synced.supplyPlanDate?.trim() ||
    synced.contractPlanDate?.trim() ||
    "";
  const factDate = synced.supplyFactDate?.trim() || synced.contractFactDate?.trim() || null;
  return {
    external_id: synced.id,
    project_part: synced.projectPart,
    name: synced.name,
    gpr_stage: synced.gprStage,
    plan_cost: Math.round(synced.planCost),
    fact_cost: synced.factCost != null ? Math.round(synced.factCost) : null,
    plan_date: planDate,
    fact_date: factDate,
    details: {
      itemCode: synced.itemCode,
      unit: synced.unit,
      volumePlan: synced.volumePlan,
      volumeFact: synced.volumeFact,
      pricePlan: synced.pricePlan,
      priceFact: synced.priceFact,
      totalPlan: synced.totalPlan,
      totalFact: synced.totalFact,
      supplier: synced.supplier,
      contract: synced.contract,
      status: synced.status,
      supplyPlanDate: synced.supplyPlanDate,
      supplyFactDate: synced.supplyFactDate,
      contractPlanDate: synced.contractPlanDate,
      contractFactDate: synced.contractFactDate,
    },
  };
}

export async function listTmcFromDb(
  token: string,
  projectPart?: "residential" | "parking",
): Promise<TMCItem[]> {
  const q = projectPart ? `?project_part=${projectPart}` : "";
  const res = await fetchAuthorizedApi(buildApiUrl(`/tmc${q}`), token, {});
  if (!res.ok) await apiJsonError(res, "Не удалось загрузить ТМЦ");
  const rows = (await res.json()) as TmcApiItem[];
  return rows.map(tmcFromApiItem);
}

export async function bulkImportTmcToDb(token: string, items: TMCItem[]): Promise<TMCItem[]> {
  const res = await fetchAuthorizedApi(buildApiUrl("/tmc/bulk-import"), token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map(tmcToApiPayload),
      replace_missing: true,
    }),
  });
  if (!res.ok) await apiJsonError(res, "Не удалось сохранить импорт ТМЦ");
  const rows = (await res.json()) as TmcApiItem[];
  return rows.map(tmcFromApiItem);
}
