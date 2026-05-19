export const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
export const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const dec1Fmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Убирает лишние нули после запятой в ручной записи «2,20» → «2,2», «245,0» → «245». */
function trimRuDecimalZeros(s: string): string {
  if (!s.includes(",")) return s;
  return s.replace(/,(0+)$/, "").replace(/,$/, "");
}

/**
 * Компактная сумма в рублях **только в млн** (без «₽», без `toLocaleString` с разрядными пробелами).
 * Правила: &lt; 1 млн — дробь (нап. 0,5 млн); 1…99,9 млн — до одной десятичной при необходимости;
 * ≥ 100 млн — целые миллионы, если значение целое, иначе одна десятичная.
 */
export function formatMillionsCompact(rub: number): string {
  if (!Number.isFinite(rub)) return "—";
  const sign = rub < 0 ? "−" : "";
  const absRub = Math.abs(rub);
  if (absRub === 0) return "0 млн";

  const mln = absRub / 1_000_000;
  const nearlyInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

  if (mln < 1) {
    const decimals = mln >= 0.1 ? 1 : 2;
    const s = trimRuDecimalZeros(mln.toFixed(decimals).replace(".", ","));
    return `${sign}${s} млн`;
  }

  if (mln >= 100) {
    if (nearlyInt(mln)) {
      return `${sign}${Math.round(mln)} млн`;
    }
    const s = trimRuDecimalZeros(mln.toFixed(1).replace(".", ","));
    return `${sign}${s} млн`;
  }

  if (nearlyInt(mln)) {
    return `${sign}${Math.round(mln)} млн`;
  }
  return `${sign}${mln.toFixed(1).replace(".", ",")} млн`;
}

/** Округление «как на оси BI»: до 0,5 млрд до 10, затем целые млрд, затем шаг 10 млрд. */
function snapBillionsExecutive(bln: number): number {
  if (!Number.isFinite(bln) || bln <= 0) return 0;
  if (bln < 10) return Math.round(bln * 2) / 2;
  if (bln < 100) return Math.round(bln);
  return Math.round(bln / 10) * 10;
}

function formatBillionsAxisCore(bln: number): string {
  const nearlyInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  if (nearlyInt(bln)) return String(Math.round(bln));
  return trimRuDecimalZeros(bln.toFixed(1).replace(".", ","));
}

/**
 * Подписи оси / тултипа / баров для графика «Выполнение плана по сегментам»:
 * до ~1 млрд — компактные **млн** (см. `formatMillionsCompact`);
 * с **≥ 999 млн** рублей — **млрд** с ровными деловыми значениями (без «999,1 млн», «1024 млн»).
 */
export function formatCompactMoneyAxis(rub: number): string {
  if (!Number.isFinite(rub)) return "—";
  if (rub === 0) return "0 млн";

  const sign = rub < 0 ? "−" : "";
  const absRub = Math.abs(rub);
  const mln = absRub / 1_000_000;

  if (mln >= 999) {
    const rawBln = absRub / 1_000_000_000;
    const bln = snapBillionsExecutive(rawBln);
    const core = formatBillionsAxisCore(bln);
    return `${sign}${core} млрд`;
  }

  return formatMillionsCompact(rub);
}

export function compactRub(n: number): string {
  return Math.abs(n) >= 1_000_000
    ? `${n < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(n) / 1_000_000))} \u043c\u043b\u043d \u20bd`
    : rubFmt.format(n);
}

/** Короткие подписи на графиках cashflow: «1 млн», «350 млн» (без «₽» в строке). */
export function formatCompactCashflowRub(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(Math.round(n));
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    const s = b % 1 === 0 ? String(Math.round(b)) : b.toFixed(1).replace(/\.0$/, "");
    return `${sign}${s} млрд`;
  }
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 1_000_000)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${abs}`;
}

/**
 * Денежные значения на графике «Динамика поступлений»: число в **единицах миллионов рублей** (или млрд как «X,XX»),
 * без слов «млн» / «млрд»; при `withRubSuffix` — суффикс « ₽».
 */
export function formatCashflowMillionsLabel(n: number, withRubSuffix = false): string {
  if (!Number.isFinite(n)) return "";
  const rub = withRubSuffix ? " ₽" : "";
  if (n === 0) return withRubSuffix ? `0${rub}` : "0";

  const sign = n < 0 ? "−" : "";
  const absRub = Math.abs(n);

  if (absRub >= 1_000_000_000) {
    const b = absRub / 1_000_000_000;
    const opts: Intl.NumberFormatOptions =
      b >= 1
        ? { maximumFractionDigits: 1, minimumFractionDigits: 0 }
        : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
    return `${sign}${b.toLocaleString("ru-RU", opts)}${rub}`;
  }

  const mln = absRub / 1_000_000;
  const opts: Intl.NumberFormatOptions =
    mln >= 1
      ? { maximumFractionDigits: 1, minimumFractionDigits: 0 }
      : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
  return `${sign}${mln.toLocaleString("ru-RU", opts)}${rub}`;
}

/**
 * Как {@link formatCashflowMillionsLabel}, но без хвоста «,0» у дробной части (`50,0` → `50`).
 */
export function formatCashflowMillionsLabelTidy(n: number, withRubSuffix = false): string {
  const s = formatCashflowMillionsLabel(n, withRubSuffix);
  if (!withRubSuffix) return trimRuDecimalZeros(s);
  const core = s.replace(/\s*₽\s*$/, "");
  return `${trimRuDecimalZeros(core)} ₽`;
}

/** Подписи на графике «Динамика поступлений» (tooltip, отклонение): как {@link formatCashflowMillionsLabel} с « ₽». */
export function formatCashflowDynamicsChartLabel(n: number): string {
  return formatCashflowMillionsLabel(n, true);
}

/**
 * Тултип поступлений: те же числовые правила, что у подписей графика (млн руб. как число + « ₽»), без слова «млн».
 */
export function formatCashflowTooltipRub(n: number): string {
  if (!Number.isFinite(n)) return "";
  return formatCashflowMillionsLabel(n, true);
}

/**
 * @deprecated Используйте {@link formatCashflowMillionsLabel}; оставлено как алиас для подписей точек.
 * Короткая форма без «₽» в конце (масштаб оси и заголовок — в млн руб. как число).
 */
export function formatCashShort(value: number): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatCashflowMillionsLabel(value, false);
}

/**
 * Ось и тултип мини-графика выручки: те же правила, что у «Динамика поступлений», без «₽» в строке.
 */
export function formatSegmentMiniRevenueChartNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return formatCashflowMillionsLabel(n, false);
}

/**
 * Подписи оси Y графика «Динамика поступлений» (серые тики слева): число + « млн» или « млрд».
 * Подписи на линии, тултип и прочие места используют {@link formatCashflowMillionsLabel} / {@link formatCashflowTooltipRub} — без «млн» в строке.
 */
export function formatCashflowYAxisMlnRub(v: number): string {
  if (!Number.isFinite(v)) return "";
  const absRub = Math.abs(v);
  const core = formatCashflowMillionsLabel(v, false);
  if (core === "") return "";
  if (absRub >= 1_000_000_000) return `${core} млрд`;
  return `${core} млн`;
}

/** Ось Y графиков «План vs факт» (помесячно и накопительно): «300 млн» без «₽». */
export function formatCumulativePlanFactYAxisTick(rub: number): string {
  if (!Number.isFinite(rub)) return "";
  const sign = rub < 0 ? "−" : "";
  const mln = Math.round(Math.abs(rub) / 1_000_000);
  return `${sign}${mln} млн`;
}

/** Подпись над столбцом «План vs факт (накопительно)»: только число в млн (напр. «113,8»); при нуле — пусто. */
export function formatCumulativePlanFactBarLabel(rub: unknown): string {
  const n = typeof rub === "number" ? rub : Number(rub);
  if (!Number.isFinite(n) || n === 0) return "";
  return formatCashflowMillionsLabelTidy(n, false);
}

/** Ось Y: min 0, max = округление вверх(max(данные)×headroom) с шагом 50 или 100 млн. */
export function cashflowYAxisScale(
  chartPlanFactValues: number[],
  opts?: { headroom?: number },
): { domainMax: number; ticks: number[] } {
  const mil = 1_000_000;
  const step50 = 50 * mil;
  const step100 = 100 * mil;
  const headroom = opts?.headroom ?? 1.1;
  const vals = chartPlanFactValues
    .map((n) => (Number.isFinite(n) ? Math.max(0, n) : 0))
    .filter((n) => n >= 0);
  const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
  const padded = maxVal * headroom;
  if (padded <= 0 || !Number.isFinite(padded)) {
    const step = step50;
    return { domainMax: step, ticks: [0, step] };
  }
  let step = step50;
  let domainMax = Math.ceil(padded / step) * step;
  if (domainMax / step > 10) {
    step = step100;
    domainMax = Math.ceil(padded / step) * step;
  }
  const ticks: number[] = [];
  for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t));
  return { domainMax, ticks };
}


/** Одна строка для подписи на баре баланса структуры: «-2,8% · -56M». */
export function structureBalanceBarLabelLine(deltaShare: number, deltaRub: number): string {
  const sPct = deltaShare >= 0 ? "+" : "−";
  const pct = `${sPct}${dec1Fmt.format(Math.abs(deltaShare))}%`;
  const absR = Math.abs(deltaRub);
  const sRub = deltaRub >= 0 ? "+" : "−";
  let rub: string;
  if (absR >= 1_000_000) rub = `${sRub}${numFmt.format(Math.round(absR / 1_000_000))}M`;
  else if (absR >= 1_000) rub = `${sRub}${numFmt.format(Math.round(absR / 1_000))}K`;
  else rub = `${sRub}${numFmt.format(Math.round(absR))}`;
  return `${pct} · ${rub}`;
}

/**
 * Средняя стоимость м² для карточек сегментов: «185 000 ₽/м²» или «1,2 млн ₽/м²» при значении ≥ 1 млн ₽/м².
 */
export function formatAvgPricePerM2Rub(rubPerM2: number): string {
  if (!Number.isFinite(rubPerM2) || rubPerM2 <= 0) return "—";
  const sign = rubPerM2 < 0 ? "−" : "";
  const abs = Math.abs(rubPerM2);
  if (abs >= 1_000_000) {
    const mln = abs / 1_000_000;
    const nearlyInt = Math.abs(mln - Math.round(mln)) < 1e-6;
    const raw = nearlyInt ? String(Math.round(mln)) : mln.toFixed(1).replace(".", ",");
    const core = raw.includes(",") ? trimRuDecimalZeros(raw) : raw;
    return `${sign}${core} млн ₽/м²`;
  }
  return `${sign}${numFmt.format(Math.round(abs))} ₽/м²`;
}
