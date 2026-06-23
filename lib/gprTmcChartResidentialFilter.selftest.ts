import { gprMockData } from "./gprMockData";
import {
  buildGprTmcDependencyChartSeries,
  tmcChartBranchRootsForPart,
} from "./gprTmcDependency";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const residentialTasks = gprMockData.filter((t) => t.partId === 1);
const todayIso = "2026-06-23";

assert(
  tmcChartBranchRootsForPart("residential", residentialTasks).join(",") === "2.05",
  "residential TMC chart roots must be only 2.05",
);

const series = buildGprTmcDependencyChartSeries(residentialTasks, [], todayIso, "residential");
const codes = series.map((row) => row.stageShort);

assert(codes.length > 0, "series must not be empty");
assert(
  codes.every((code) => code.startsWith("2.05")),
  `all X-axis codes must be 2.05.*, got: ${codes.join(", ")}`,
);
assert(
  !codes.some((code) => code.startsWith("2.04")),
  `2.04 stages must be excluded, got: ${codes.join(", ")}`,
);
assert(codes[0] === "2.05.01", "series must start with 2.05.01");

console.log("[gprTmcChartResidentialFilter.selftest] OK", { count: codes.length, first: codes[0], last: codes[codes.length - 1] });
