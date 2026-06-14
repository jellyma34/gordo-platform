"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";

type ToastState = { type: "success" | "error"; message: string } | null;

type Props = {
  hasCsv: boolean;
  loading?: boolean;
  presDark?: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onClear: () => Promise<void>;
};

const TOAST_MS = 4200;

export function UploadSalesSegmentsCsvButton({
  hasCsv,
  loading = false,
  presDark = false,
  onUploadFile,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const uploadBtnCls = presDark
    ? "rounded-md border border-indigo-400/45 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-45"
    : "rounded-md border border-indigo-500/50 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-45";

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setToast({ type: "error", message: "Нужен файл .csv" });
        return;
      }
      try {
        await onUploadFile(file);
        setToast({ type: "success", message: "CSV загружен, график обновлён" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось загрузить CSV";
        setToast({ type: "error", message: msg });
      }
    },
    [onUploadFile],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void processFile(file);
    },
    [processFile],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (loading) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [loading, processFile],
  );

  const onClearClick = useCallback(async () => {
    try {
      await onClear();
      setToast({ type: "success", message: "CSV сброшен" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сбросить CSV";
      setToast({ type: "error", message: msg });
    }
  }, [onClear]);

  return (
    <div
      className="relative flex shrink-0 flex-wrap items-center justify-end gap-2"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-busy={loading}
    >
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />

      <button
        type="button"
        disabled={loading}
        className={`${uploadBtnCls} inline-flex items-center gap-1.5 ${dragOver ? "ring-2 ring-indigo-400/60 ring-offset-1" : ""}`}
        title="Перетащите CSV сюда или нажмите для выбора"
        onClick={() => inputRef.current?.click()}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
        {loading ? "Загрузка…" : "Загрузить CSV"}
      </button>

      {hasCsv ? (
        <button
          type="button"
          disabled={loading}
          className="text-xs font-semibold text-rose-600 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => void onClearClick()}
        >
          Сбросить CSV
        </button>
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`pointer-events-none absolute right-0 top-full z-20 mt-2 max-w-[min(20rem,90vw)] rounded-lg border px-3 py-2 text-xs font-medium shadow-lg ${
            toast.type === "success"
              ? presDark
                ? "border-emerald-500/40 bg-emerald-950/95 text-emerald-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
              : presDark
                ? "border-rose-500/40 bg-rose-950/95 text-rose-100"
                : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
