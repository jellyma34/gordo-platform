export type GPRTask = {
  id: string;
  code: string;
  name: string;
  planStart: string;
  planEnd: string;
  factStart?: string;
  factEnd?: string;
  completion: number;
  comment?: string;
  children?: GPRTask[];
};

export type GPRStatus = "green" | "yellow" | "red";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function toDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function daysBetween(start: string, end: string) {
  const diff = toDate(end).getTime() - toDate(start).getTime();
  return Math.round(diff / MS_PER_DAY);
}

export function durationDays(start: string, end: string) {
  return daysBetween(start, end) + 1;
}

export function calculateDeviation(task: GPRTask) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const compareDate = task.factEnd ?? todayIso;
  return daysBetween(task.planEnd, compareDate);
}

export function getStatus(task: GPRTask): GPRStatus {
  const deviation = calculateDeviation(task);
  return getStatusByDeviation(deviation);
}

export function getStatusByDeviation(deviation: number): GPRStatus {
  if (deviation <= 0) return "green";
  if (deviation <= 3) return "yellow";
  return "red";
}

export function getStatusLabel(status: GPRStatus) {
  if (status === "green") return "В срок";
  if (status === "yellow") return "Риск";
  return "Просрочка";
}

export function flattenTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.flatMap((task) => [
    task,
    ...(task.children ? flattenTasks(task.children) : []),
  ]);
}

export function getProjectStats(tasks: GPRTask[]) {
  const all = flattenTasks(tasks);
  const deviations = all.map(calculateDeviation);
  const total = all.length;
  const completed = all.filter((task) => task.completion >= 100).length;
  const overdue = deviations.filter((value) => value > 3).length;
  const avgDeviation =
    deviations.length > 0
      ? Number(
          (deviations.reduce((sum, value) => sum + value, 0) / deviations.length).toFixed(
            1,
          ),
        )
      : 0;

  const statusCounts = all.reduce(
    (acc, task) => {
      const status = getStatus(task);
      acc[status] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 },
  );

  return { total, completed, overdue, avgDeviation, statusCounts };
}
