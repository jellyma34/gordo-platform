/**
 * Самопроверка сортировки шифров ГПР (иерархия, несколько корней).
 * Запуск: npm run test:gpr-code
 */
import assert from "node:assert/strict";

import { compareGprCodesByNumericPath, gprCodeToNumericSegments } from "./gprUtils";

function sortCodes(codes: string[]): string[] {
  return [...codes].sort(compareGprCodesByNumericPath);
}

const input = ["2.05.01.1", "2.04.03", "2.05.01", "2.04.01"];
const expected = ["2.04.01", "2.04.03", "2.05.01", "2.05.01.1"];
assert.deepEqual(sortCodes(input), expected);

assert.deepEqual(gprCodeToNumericSegments("2.05.01.2"), [2, 5, 1, 2]);

const canonicalOrder = [
  "2.04",
  "2.04.01",
  "2.04.03",
  "2.04.04",
  "2.05",
  "2.05.01",
  "2.05.01.1",
  "2.05.01.2",
  "2.05.02",
  "2.05.04",
];
const shuffled = [
  "2.05.02",
  "2.04",
  "2.05.01.2",
  "2.04.01",
  "2.05.04",
  "2.05",
  "2.04.04",
  "2.05.01",
  "2.04.03",
  "2.05.01.1",
];
assert.deepEqual(sortCodes(shuffled), canonicalOrder);

console.log("gprCodeSort selftest: ok");
