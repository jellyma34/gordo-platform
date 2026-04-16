"use client";

/**
 * Раздел «Рассрочка ДДУ» в рабочем режиме маркетинга (UI, без API).
 */

const shell =
  "rounded-2xl border border-slate-700/60 bg-[#1e293b] p-4 shadow-sm sm:p-5";
const h2 = "text-base font-semibold text-slate-100";
const sub = "mt-1 text-sm text-slate-400";
const kpiSurface =
  "relative overflow-hidden rounded-xl border border-amber-500/15 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-slate-950/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const kpiLabel = "text-[10px] font-bold uppercase tracking-wide text-amber-200/75";

export function InstallmentsSection() {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-700/50 bg-[#0f172a]/95 p-4 shadow-inner sm:p-5">
      <header>
        <h2 className={h2}>Рассрочка ДДУ</h2>
        <p className={sub}>Доля рассрочки, средний чек и структура (заглушки до подключения данных).</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={shell}>
          <h3 className="text-sm font-semibold text-slate-100">Доля сделок в рассрочку</h3>
          <p className="mt-1 text-[11px] text-slate-500">% от всех ДДУ в периоде.</p>
          <div className={`mt-3 ${kpiSurface}`}>
            <div className={kpiLabel}>Доля, %</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-50">—</div>
          </div>
        </div>
        <div className={shell}>
          <h3 className="text-sm font-semibold text-slate-100">Средний чек</h3>
          <p className="mt-1 text-[11px] text-slate-500">По сделкам с рассрочкой.</p>
          <div className={`mt-3 ${kpiSurface}`}>
            <div className={kpiLabel}>₽</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-50">—</div>
          </div>
        </div>
      </div>

      <div className={shell}>
        <h3 className="text-sm font-semibold text-slate-100">Разбивка</h3>
        <p className="mt-1 text-[11px] text-slate-500">Упрощённая структура (плейсхолдер).</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-600/40">
          <table className="w-full min-w-[320px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-600/50 text-slate-400">
                <th className="p-3 font-semibold">Показатель</th>
                <th className="p-3 font-semibold">Значение</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-b border-slate-700/50">
                <td className="p-3">Категория А</td>
                <td className="p-3 tabular-nums text-slate-500">—</td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="p-3">Категория B</td>
                <td className="p-3 tabular-nums text-slate-500">—</td>
              </tr>
              <tr>
                <td className="p-3">Прочее</td>
                <td className="p-3 tabular-nums text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Детализация появится после подключения данных.</p>
      </div>
    </div>
  );
}
