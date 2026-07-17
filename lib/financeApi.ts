/**
 * Клиент FastAPI для финансовых импортов (PostgreSQL — источник истины).
 */
import { buildApiUrl, fetchAuthorizedApi } from "@/lib/apiClient";
import { loadStoredAuth } from "@/lib/authStorage";
import type { FinanceBudgetSnapshot } from "@/lib/financeBudgetData";
import type { FinanceExecutionImport } from "@/lib/financeBudgetExecutionData";

function authToken(): string | null {
  return loadStoredAuth()?.token ?? null;
}

type FinanceImportApiEnvelope = {
  projectId?: string;
  payload?: Record<string, unknown>;
  updatedAt?: string | null;
};

export async function fetchFinanceBudgetFromDb(
  projectId: string,
): Promise<FinanceBudgetSnapshot | null> {
  const token = authToken();
  if (!token) return null;
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetchAuthorizedApi(
      buildApiUrl(`/finance/budget-imports?projectId=${q}`),
      token,
      { method: "GET" },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as FinanceImportApiEnvelope;
    const payload = body.payload;
    if (!payload || typeof payload !== "object") return null;
    const lines = Array.isArray(payload.lines)
      ? payload.lines
      : Array.isArray(payload.items)
        ? payload.items
        : null;
    if (!lines || lines.length === 0) return null;
    return {
      lines: lines as FinanceBudgetSnapshot["lines"],
      updatedAt:
        typeof payload.updatedAt === "string"
          ? payload.updatedAt
          : typeof body.updatedAt === "string"
            ? body.updatedAt
            : undefined,
      importMeta:
        payload.importMeta && typeof payload.importMeta === "object"
          ? (payload.importMeta as FinanceBudgetSnapshot["importMeta"])
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function putFinanceBudgetToDb(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): Promise<boolean> {
  const token = authToken();
  if (!token) return false;
  try {
    const res = await fetchAuthorizedApi(buildApiUrl("/finance/budget-imports"), token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        payload: {
          lines: snapshot.lines,
          updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
          importMeta: snapshot.importMeta ?? null,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchFinanceExecutionFromDb(
  projectId: string,
): Promise<FinanceExecutionImport | null> {
  const token = authToken();
  if (!token) return null;
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetchAuthorizedApi(
      buildApiUrl(`/finance/execution-imports?projectId=${q}`),
      token,
      { method: "GET" },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const body = (await res.json()) as FinanceImportApiEnvelope;
    const payload = body.payload;
    if (!payload || typeof payload !== "object") return null;
    return payload as unknown as FinanceExecutionImport;
  } catch {
    return null;
  }
}

export async function putFinanceExecutionToDb(
  projectId: string,
  snapshot: FinanceExecutionImport,
): Promise<boolean> {
  const token = authToken();
  if (!token) return false;
  try {
    const res = await fetchAuthorizedApi(buildApiUrl("/finance/execution-imports"), token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        payload: snapshot,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
