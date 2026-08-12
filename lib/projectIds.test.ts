import { describe, expect, it } from "vitest";

import { CANONICAL_DEFAULT_PROJECT_ID, normalizeProjectId } from "@/lib/projectIds";
import { getGprStorageMode } from "@/lib/gprStorageMode";

describe("projectIds", () => {
  it("maps legacy default to verba-phase-1", () => {
    expect(normalizeProjectId("default")).toBe(CANONICAL_DEFAULT_PROJECT_ID);
    expect(normalizeProjectId("")).toBe(CANONICAL_DEFAULT_PROJECT_ID);
    expect(normalizeProjectId("verba-phase-1")).toBe("verba-phase-1");
  });
});

describe("gprStorageMode", () => {
  it("defaults to postgres (not local)", () => {
    expect(getGprStorageMode()).toBe("postgres");
  });
});
