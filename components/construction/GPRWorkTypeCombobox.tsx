"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GPR_DATA, type GPRItem } from "@/lib/gprData";
import type { GprWorkCatalogItem } from "@/lib/gprWorkCatalog";

const SECTION_GPR = "ГПР";
const SECTION_CUSTOM = "Пользовательские";
const SECTION_ORDER = [SECTION_GPR, SECTION_CUSTOM] as const;

type RowItem = GPRItem & { group: (typeof SECTION_ORDER)[number] };

type Props = {
  taskId: string;
  name: string;
  taskCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onSelectCatalog: (code: string, name: string) => void;
  extraItems: GprWorkCatalogItem[];
  onAddCustomItem: (item: GprWorkCatalogItem) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  /** Дополнительные классы для поля ввода (типографика родителя/потомка и т.п.) */
  inputClassName?: string;
};

function gprWorkRowPaddingClass(level: number): string {
  if (level <= 1) return "pl-2";
  if (level === 2) return "pl-4";
  if (level === 3) return "pl-6";
  if (level === 4) return "pl-8";
  return "pl-10";
}

function matchesQuery(item: GPRItem, q: string) {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  return item.name.toLowerCase().includes(n) || item.code.toLowerCase().includes(n);
}

function buildRows(extraItems: GprWorkCatalogItem[]): RowItem[] {
  const gprRows: RowItem[] = GPR_DATA.map((w) => ({ ...w, group: SECTION_GPR }));
  const custom: RowItem[] = extraItems.map((e) => ({ ...e, group: SECTION_CUSTOM }));
  return [...gprRows, ...custom];
}

export function GPRWorkTypeCombobox({
  taskId,
  name,
  taskCode,
  open,
  onOpenChange,
  onNameChange,
  onSelectCatalog,
  extraItems,
  onAddCustomItem,
  inputRef,
  inputClassName = "",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const allRows = useMemo(() => buildRows(extraItems), [extraItems]);

  const filteredByGroup = useMemo(() => {
    const map = new Map<string, RowItem[]>();
    for (const g of SECTION_ORDER) map.set(g, []);
    for (const item of allRows) {
      if (!matchesQuery(item, name)) continue;
      map.get(item.group)?.push(item);
    }
    return map;
  }, [allRows, name]);

  const flatFiltered = useMemo(() => {
    const out: RowItem[] = [];
    for (const g of SECTION_ORDER) {
      out.push(...(filteredByGroup.get(g) ?? []));
    }
    return out;
  }, [filteredByGroup]);

  const rowsWithIndex = useMemo(() => {
    let idx = 0;
    return SECTION_ORDER.flatMap((group) => {
      const items = filteredByGroup.get(group) ?? [];
      return items.map((item) => ({ group, item, flatIdx: idx++ }));
    });
  }, [filteredByGroup]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [name, open, taskId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  const pick = (item: RowItem) => {
    onSelectCatalog(item.code, item.name);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      onOpenChange(true);
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, Math.max(0, flatFiltered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatFiltered.length > 0) {
      e.preventDefault();
      pick(flatFiltered[highlightIndex]!);
    }
  };

  useEffect(() => {
    if (!open || flatFiltered.length === 0) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlightIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open, flatFiltered.length]);

  const addCustom = () => {
    const code = window.prompt("Код работы (например 2.10.01):", "")?.trim();
    if (!code) return;
    const customName = window.prompt("Наименование работы:", "")?.trim();
    if (!customName) return;
    const level = code.split(".").length;
    const item: GprWorkCatalogItem = {
      code,
      name: customName,
      level,
      group: "Пользовательские",
    };
    onAddCustomItem(item);
    onSelectCatalog(item.code, item.name);
    onOpenChange(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onFocus={() => onOpenChange(true)}
        onKeyDown={onKeyDown}
        placeholder="Название или поиск по коду/названию из ГПР"
        title={name || "Наименование"}
        autoComplete="off"
        aria-expanded={open}
        aria-controls={`gpr-work-list-${taskId}`}
        aria-autocomplete="list"
        className={`h-8 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 ${inputClassName}`}
      />

      {open && (
        <div
          id={`gpr-work-list-${taskId}`}
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1 text-sm">
            {SECTION_ORDER.map((group) => {
              const groupRows = rowsWithIndex.filter((r) => r.group === group);
              if (groupRows.length === 0) return null;
              return (
                <div key={group}>
                  <div className="sticky top-0 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    {group}
                  </div>
                  {groupRows.map(({ item, flatIdx: idx }) => {
                    const selected = item.code === taskCode;
                    const highlighted = idx === highlightIndex;
                    return (
                      <button
                        key={`${group}-${item.code}-${idx}`}
                        type="button"
                        role="option"
                        data-idx={idx}
                        aria-selected={selected}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(item)}
                        className={`w-full py-2 pr-3 text-left text-sm ${gprWorkRowPaddingClass(item.level)} ${
                          highlighted ? "bg-indigo-50" : "hover:bg-slate-50"
                        } ${selected ? "font-medium text-indigo-800" : "text-slate-800"}`}
                      >
                        <span className="font-mono text-xs tabular-nums text-slate-600">{item.code}</span>
                        <span className="ml-2">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {flatFiltered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Ничего не найдено. Уточните запрос или добавьте свой тип.
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addCustom}
              className="w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              + Добавить свой тип работы
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
