"use client";

import { useEffect } from "react";

/**
 * Error boundary сегмента: ловит ошибки в дереве (не путать с `HomeErrorBoundary` на `/`).
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("app/error.tsx:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold text-slate-900">Ошибка</h1>
      <p className="mt-2 text-sm text-slate-600">
        {error?.message || "Сбой рендера. Попробуйте снова или очистите кэш .next."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        Повторить
      </button>
    </div>
  );
}
