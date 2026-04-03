"use client";

import type { ReactNode } from "react";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800";

export function EditLayout({
  title,
  subtitle,
  children,
  onSave,
  onCancel,
  showActions = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
  /** Показывать пару кнопок в шапке (если обе функции не переданы — блок действий скрыт) */
  showActions?: boolean;
}) {
  const hasActions = showActions && (onSave != null || onCancel != null);

  return (
    <div className="edit-layout mx-auto w-full max-w-7xl">
      <div className="edit-content rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="edit-header flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-start md:justify-between md:px-6 md:py-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {hasActions ? (
            <div className="actions flex shrink-0 flex-wrap gap-2">
              {onCancel ? (
                <button type="button" onClick={onCancel} className={btnSecondary}>
                  Отменить
                </button>
              ) : null}
              {onSave ? (
                <button type="button" onClick={onSave} className={btnPrimary}>
                  Сохранить
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export { btnPrimary, btnSecondary };
