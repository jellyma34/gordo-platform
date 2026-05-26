"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";

type Props = {
  presDark: boolean;
  busy: boolean;
  hasCsv: boolean;
  updatedLabel?: string | null;
  onUpload: (file: File) => Promise<void>;
  onClear: () => Promise<void>;
  accept?: string;
};

/** Заголовок загрузки CSV (как в блоках площади / средней цены). */
export function AnalyticsCsvUploadToolbar({
  presDark,
  busy,
  hasCsv,
  updatedLabel,
  onUpload,
  onClear,
  accept = ".csv,text/csv",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const mutedCls = presDark ? "text-slate-400" : "text-slate-500";
  const uploadBtnCls = presDark
    ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/50 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-sm hover:border-slate-400/60 disabled:opacity-40"
    : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400 disabled:opacity-40";

  const processFile = useCallback(
    async (file: File) => {
      setLocalErr(null);
      try {
        await onUpload(file);
      } catch (e) {
        setLocalErr(e instanceof Error ? e.message : "Не удалось загрузить файл");
      }
    },
    [onUpload],
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void processFile(file);
        }}
      />
      <button type="button" disabled={busy} className={uploadBtnCls} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Загрузить CSV
      </button>
      {hasCsv ? (
        <button
          type="button"
          disabled={busy}
          className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:opacity-40"
          onClick={() => void onClear()}
        >
          Сбросить
        </button>
      ) : null}
      {hasCsv && updatedLabel ? <span className={`text-[11px] ${mutedCls}`}>{updatedLabel}</span> : null}
      {localErr ? <span className="w-full text-right text-[11px] text-rose-600">{localErr}</span> : null}
    </div>
  );
}
