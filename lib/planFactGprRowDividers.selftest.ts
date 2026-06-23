import {
  planFactGprRowDividerFractions,
  planFactGprRowDividerTops,
  PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
} from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Одна строка (упрощённый режим, только 2.05) — верх и низ полосы.
assert(
  planFactGprRowDividerFractions(1).join(",") === "0,1",
  "single row: top and bottom fractions",
);
const singleTops = planFactGprRowDividerTops(1);
assert(singleTops.length === 2, "single row: two divider lines");
assert(
  singleTops[0] === PLAN_FACT_GPR_CHART_TOP_PADDING_PX,
  "single row: top line at padding",
);
assert(
  singleTops[1] === PLAN_FACT_GPR_CHART_TOP_PADDING_PX + PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  "single row: bottom line after row height",
);

// Несколько строк — линии между строками (как в «Все этапы»).
assert(planFactGprRowDividerFractions(3).join(",") === "0.3333333333333333,0.6666666666666666", "3 rows");
const threeTops = planFactGprRowDividerTops(3);
assert(threeTops.length === 2, "3 rows: two dividers");
assert(
  threeTops[0] === PLAN_FACT_GPR_CHART_TOP_PADDING_PX + PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX,
  "3 rows: first divider after row 1",
);

console.log("[planFactGprRowDividers.selftest] OK");
