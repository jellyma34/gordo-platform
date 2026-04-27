"use client";

import { useEffect, useState } from "react";

const LOADING_TIMEOUT_MS = 3000;

/**
 * Fallback для Suspense (useSearchParams и др.): не оставляем бесконечный «Загрузка…».
 */
export function ConstructionRouteSuspenseFallback() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (timedOut) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm font-medium text-slate-800">Не удалось загрузить данные</p>
        <p className="max-w-md text-xs text-slate-500">
          Секция долго не отвечает. Попробуйте перезагрузить страницу. При 404 по JS-файлам в консоли очистите кэш
          сборки (<code className="rounded bg-slate-100 px-1">.next</code>) и снова запустите dev-сервер.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Перезагрузить
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">Загрузка раздела…</div>
  );
}
