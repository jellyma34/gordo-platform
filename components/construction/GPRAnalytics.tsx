import type { GPRTask } from "@/lib/gprUtils";
import {
  flattenTasks,
  durationDays,
  getProjectStats,
  getStatusByDeviation,
  toDate,
} from "@/lib/gprUtils";

function getProjectCompletion(tasks: GPRTask[]) {
  const all = flattenTasks(tasks);
  if (all.length === 0) return 0;
  const avg = all.reduce((sum, task) => sum + task.completion, 0) / all.length;
  return Math.round(avg);
}

export function GPRAnalytics({
  tasks,
  mode,
}: {
  tasks: GPRTask[];
  mode: "edit" | "view";
}) {
  const metrics = getProjectStats(tasks);
  const projectCompletion = getProjectCompletion(tasks);
  const flatTasks = flattenTasks(tasks);
  const inTimeTasks = metrics.statusCounts.green;
  const riskLongTasks = flatTasks.filter((task) => {
    const duration = Math.max(
      1,
      Math.round(
        (new Date(`${task.planEnd}T00:00:00`).getTime() -
          new Date(`${task.planStart}T00:00:00`).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1,
    );
    return duration > 14;
  }).length;

  const totalStatus = Math.max(
    1,
    metrics.statusCounts.green + metrics.statusCounts.yellow + metrics.statusCounts.red,
  );

  const greenPercent = Math.round((metrics.statusCounts.green / totalStatus) * 100);
  const yellowPercent = Math.round((metrics.statusCounts.yellow / totalStatus) * 100);
  const redPercent = 100 - greenPercent - yellowPercent;

  const pieStyle = {
    background: `conic-gradient(
      #10b981 0% ${greenPercent}%,
      #f59e0b ${greenPercent}% ${greenPercent + yellowPercent}%,
      #ef4444 ${greenPercent + yellowPercent}% 100%
    )`,
  };

  const chartDomain = Math.max(1, Math.abs(metrics.avgDeviation), 3);
  const chartHeight = 70;
  const baselineY = 110;
  const actualY = baselineY - (metrics.avgDeviation / chartDomain) * chartHeight;
  const actualBarY = Math.min(actualY, baselineY);
  const actualBarHeight = Math.max(2, Math.abs(baselineY - actualY));
  const projectStatus = getStatusByDeviation(metrics.avgDeviation);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Aggregate to avoid per-row noise: show only top-level stages (e.g. codes without ".")
  const chartData: Array<{ name: string; plan: number; fact: number }> =
    flatTasks
      .filter((task) => !task.code.includes("."))
      .sort((a, b) => toDate(a.planStart).getTime() - toDate(b.planStart).getTime())
      .map((task) => {
        const plan = durationDays(task.planStart, task.planEnd);
        const factStart = task.factStart ?? task.planStart;
        const factEnd = task.factEnd ?? todayIso;
        const fact = durationDays(factStart, factEnd);
        return { name: task.name, plan, fact };
      });

  if (mode === "edit") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded bg-slate-50 p-3">
            <p className="text-slate-500">Всего задач</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.total}</p>
          </div>
          <div className="rounded bg-slate-50 p-3">
            <p className="text-slate-500">Завершено</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{metrics.completed}</p>
          </div>
          <div className="rounded bg-slate-50 p-3">
            <p className="text-slate-500">Просрочено</p>
            <p className="mt-1 text-xl font-semibold text-rose-600">{metrics.overdue}</p>
          </div>
          <div className="rounded bg-slate-50 p-3">
            <p className="text-slate-500">Ср. отклонение</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {metrics.avgDeviation > 0 ? "+" : ""}
              {metrics.avgDeviation} дн.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">% выполнения</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{projectCompletion}%</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Задач в срок</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">{inTimeTasks}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Просроченные задачи</p>
          <p className="mt-2 text-3xl font-semibold text-rose-600">{metrics.overdue}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Задачи &gt; 14 дней</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{riskLongTasks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Отклонение (план vs факт)</h3>
          <p className="mt-2 text-xs text-slate-500">
            Агрегированное сравнение по проекту: план (0) и среднее отклонение факта.
          </p>
          <svg viewBox="0 0 280 150" className="mt-4 w-full">
            <line x1="25" y1={baselineY} x2="250" y2={baselineY} stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1="25" y1="30" x2="25" y2="130" stroke="#cbd5e1" strokeWidth="1.5" />
            <rect x="80" y={baselineY - 2} width="38" height="2" rx="2" fill="#64748b" />
            <rect
              x="160"
              y={actualBarY}
              width="38"
              height={actualBarHeight}
              rx="4"
              fill={metrics.avgDeviation <= 0 ? "#10b981" : "#ef4444"}
            />
            <text x="99" y="145" textAnchor="middle" fontSize="11" fill="#64748b">
              План
            </text>
            <text x="179" y="145" textAnchor="middle" fontSize="11" fill="#64748b">
              Факт
            </text>
            <text x="140" y="145" textAnchor="middle" fontSize="11" fill="#0f172a">
              Проект
            </text>
          </svg>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Динамика сроков</h3>
          <p className="mt-2 text-xs text-slate-500">
            Распределение задач по статусам и риск-профилю проекта.
          </p>
          <div className="mt-4 flex items-center gap-5">
            <div className="h-36 w-36 rounded-full" style={pieStyle} />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                В срок: {metrics.statusCounts.green} ({greenPercent}%)
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-amber-500" />
                Риск: {metrics.statusCounts.yellow} ({yellowPercent}%)
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-rose-500" />
                Просрочка: {metrics.statusCounts.red} ({redPercent}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          План vs Факт (длительность)
        </h3>
        <p className="mt-2 text-xs text-slate-500">
          Плановые сроки (синяя линия) и фактическое выполнение (красная линия).
        </p>

        {(() => {
          const n = chartData.length;
          const maxY = Math.max(1, ...chartData.flatMap((d) => [d.plan, d.fact]));
          const paddingLeft = 44;
          const paddingRight = 16;
          const paddingTop = 18;
          const paddingBottom = 28;
          const width = 280;
          const height = 100;
          const chartW = width - paddingLeft - paddingRight;
          const chartH = height - paddingTop - paddingBottom;
          const y0 = paddingTop + chartH;
          const xAt = (index: number) =>
            paddingLeft + (n === 1 ? chartW / 2 : (index * chartW) / (n - 1));
          const yAt = (value: number) => paddingTop + (1 - value / maxY) * chartH;

          const planPath = chartData
            .map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(d.plan)}`)
            .join(" ");
          const factPath = chartData
            .map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(d.fact)}`)
            .join(" ");

          const yTicks = [0, Math.round(maxY / 2), maxY];

          return (
            <>
              <svg viewBox="0 0 280 100" className="mt-4 w-full">
              {/* Grid + Axes */}
              {/* Vertical grid lines */}
              {chartData.map((d, i) => {
                const cx = xAt(i);
                return (
                  <line
                    key={`vx-${d.name}-${i}`}
                    x1={cx}
                    y1={paddingTop}
                    x2={cx}
                    y2={y0}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                );
              })}

                <line
                  x1={paddingLeft}
                  y1={y0}
                  x2={width - paddingRight}
                  y2={y0}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <line
                  x1={paddingLeft}
                  y1={paddingTop}
                  x2={paddingLeft}
                  y2={y0}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />

                {/* Y ticks */}
                {yTicks.map((t) => {
                  const y = yAt(t);
                  return (
                    <g key={`yt-${t}`}>
                      <line
                        x1={paddingLeft - 4}
                        y1={y}
                        x2={paddingLeft}
                        y2={y}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x={paddingLeft - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#64748b"
                      >
                        {t}
                      </text>
                    </g>
                  );
                })}

                {/* Plan line */}
                <path
                  d={planPath}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Fact line */}
                <path
                  d={factPath}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Hit areas + Tooltip (no visible dots) */}
                {chartData.map((d, i) => {
                  const cx = xAt(i);
                  const cyPlan = yAt(d.plan);
                  const cyFact = yAt(d.fact);
                  const deviation = d.fact - d.plan;
                  const deviationText =
                    deviation >= 0
                      ? `+${deviation} дней`
                      : `-${Math.abs(deviation)} дней`;
                  const stageLabel = `Этап ${i + 1}`;
                  return (
                    <g key={`hit-${d.name}-${i}`}>
                      <circle cx={cx} cy={cyFact} r={8} opacity={0}>
                        <title>
                          {`${d.name}\n${stageLabel}\nПлан: ${d.plan} дн.\nФакт: ${d.fact} дн.\nОтклонение (Факт - План): ${deviationText}`}
                        </title>
                      </circle>
                      <text
                        x={cx}
                        y={y0 + 16}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748b"
                      >
                        {stageLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-[#64748b]" />
                  План
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                  Факт
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </section>
  );
}
