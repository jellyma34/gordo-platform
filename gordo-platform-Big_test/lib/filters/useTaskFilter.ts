import { useMemo } from "react";

export type TaskStatusFilter = "all" | "blocked" | "delay" | "ok";

export type FilterTaskBase = {
  id: string;
  name: string;
  code: string;
};

export type FilterTreeTaskBase = FilterTaskBase & {
  parentId?: string;
};

/**
 * Общая фильтрация по name/code + статусу.
 */
export function useTaskFilter<T extends FilterTaskBase>(
  items: T[],
  search: string,
  statusFilter: TaskStatusFilter,
  getStatus: (item: T) => Exclude<TaskStatusFilter, "all">,
): T[] {
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const bySearch = !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
      const st = getStatus(item);
      const byStatus = statusFilter === "all" ? true : st === statusFilter;
      return bySearch && byStatus;
    });
  }, [items, search, statusFilter, getStatus]);
}

/**
 * Фильтр дерева в плоском массиве:
 * - если совпал родитель -> показываем весь его поддеревом;
 * - если совпал потомок -> показываем цепочку предков до корня.
 */
export function filterTaskTree<T extends FilterTreeTaskBase>(
  items: T[],
  isDirectMatch: (item: T) => boolean,
): T[] {
  if (items.length === 0) return items;
  const byId = new Map(items.map((x) => [x.id, x]));
  const children = new Map<string | undefined, string[]>();
  for (const item of items) {
    const key = item.parentId;
    const list = children.get(key) ?? [];
    list.push(item.id);
    children.set(key, list);
  }

  const include = new Set<string>();

  const visit = (id: string, ancestorMatched: boolean): boolean => {
    const current = byId.get(id);
    if (!current) return false;
    const selfMatched = isDirectMatch(current);
    const subtreeMatched = ancestorMatched || selfMatched;

    let matchedByChildren = false;
    for (const childId of children.get(id) ?? []) {
      if (visit(childId, subtreeMatched)) matchedByChildren = true;
    }

    const shouldInclude = subtreeMatched || matchedByChildren;
    if (shouldInclude) include.add(id);
    return shouldInclude;
  };

  for (const rootId of children.get(undefined) ?? []) visit(rootId, false);
  return items.filter((item) => include.has(item.id));
}

