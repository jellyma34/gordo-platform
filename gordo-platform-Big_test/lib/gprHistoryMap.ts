import type {
  EntityHistoryDetail,
  EntityHistoryListItem,
  EntityVersionDetail,
  EntityVersionListItem,
} from "@/lib/auth";

/** API ``/history`` отдаёт записи от старых к новым; в UI — как раньше, сначала новые и с номером версии. */
export function historyRowsToVersionListItems(rows: EntityHistoryListItem[]): EntityVersionListItem[] {
  const n = rows.length;
  return [...rows].reverse().map((row, idx) => ({
    id: row.id,
    entity_id: row.entity_id,
    version_number: n - idx,
    created_at: row.created_at,
    changed_by: row.changed_by,
    created_by: row.changed_by_name ?? null,
    changed_by_name: row.changed_by_name,
    changed_by_role: row.changed_by_role ?? "—",
    change_type: row.change_type,
  }));
}

export function historyDetailToVersionDetail(
  d: EntityHistoryDetail,
  versionNumber: number,
): EntityVersionDetail {
  return {
    id: d.id,
    entity_id: d.entity_id,
    data: d.data,
    version_number: versionNumber,
    created_at: d.created_at,
    changed_by: d.changed_by,
    created_by: d.changed_by_name ?? null,
    changed_by_name: d.changed_by_name,
    changed_by_role: d.changed_by_role ?? "—",
    change_type: d.change_type,
  };
}
