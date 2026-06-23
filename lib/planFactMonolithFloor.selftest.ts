import {
  GPR_MONOLITH_CHART_STAGE_CODE,
  computeMonolithFloorFactSlice,
  monolithFactProgressMsFromPlanPercent,
  splitSequentialPlanIsoSegments,
} from "./planFactWorkTypeTimeline";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const MS_PER_DAY = 86400000;
function isoDayMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}

const planStart = "2026-03-01";
const planEnd = "2026-08-31";
const segments = splitSequentialPlanIsoSegments(planStart, planEnd, 9);
assert(segments.length === 9, "9 segments");
assert(segments[0]?.start === "2026-03-01", "first start");
assert(segments[8]?.end === "2026-08-31", "last end");
assert(segments[1]!.start > segments[0]!.end, "sequential");

const psm = isoDayMs(planStart);
const pem = isoDayMs(planEnd);
const totalDays = Math.round((pem - psm) / MS_PER_DAY) + 1;
assert(totalDays === 184, `total days ${totalDays}`);

const factPercent = 49.2;
const progressMs = monolithFactProgressMsFromPlanPercent(psm, pem, factPercent);
assert(progressMs != null, "progressMs");

const floorFacts = segments.map((seg) => computeMonolithFloorFactSlice(seg.start, seg.end, progressMs));
assert(floorFacts[0]!.floorPercent === 100, "floor 1 = 100%");
assert(floorFacts[1]!.floorPercent === 100, "floor 2 = 100%");
assert(floorFacts[2]!.floorPercent === 100, "floor 3 = 100%");
assert(floorFacts[3]!.floorPercent === 100, "floor 4 = 100%");
assert(floorFacts[4]!.floorPercent > 0 && floorFacts[4]!.floorPercent < 100, "floor 5 partial");
assert(floorFacts[5]!.floorPercent === 0, "floor 6 = 0%");
assert(floorFacts[6]!.floorPercent === 0, "floor 7 = 0%");
assert(floorFacts[7]!.floorPercent === 0, "floor 8 = 0%");
assert(floorFacts[8]!.floorPercent === 0, "floor 9 = 0%");

console.log("[planFactMonolithFloor.selftest] OK", GPR_MONOLITH_CHART_STAGE_CODE, {
  totalDays,
  floorDurationDays: totalDays / 9,
  factPercent,
  floors: floorFacts.map((f, i) => ({ floor: i + 1, percent: f.floorPercent })),
});
