import type { GPRTask } from "@/lib/gprUtils";
import seedPayload from "../data/gpr-import-default.json";

type GprImportSeedFile = {
  tasks?: GPRTask[];
};

const payload = seedPayload as GprImportSeedFile | GPRTask[];
const tasks = Array.isArray(payload) ? payload : (payload.tasks ?? []);

/** Fallback-задачи ГПР: снимок из `data/gpr-import-default.json` (CSV «Исполнение ГПР_май»). */
export const gprMockData: GPRTask[] = tasks.map((task) => ({
  ...task,
  globalTaskId: task.globalTaskId || task.code,
}));
