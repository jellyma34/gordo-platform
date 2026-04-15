"use client";

/** Результат проверок строки (код, даты и т.д.) */
export type GprIssueBundle = { errors: string[]; warnings: string[] };

export function gprIssueTooltipText(issues: GprIssueBundle): string {
  const lines = [...issues.errors, ...issues.warnings];
  return lines.join("\n");
}

/** Текст для `title` у статуса; `undefined`, если замечаний нет */
export function gprIssueStatusTitle(issues: GprIssueBundle | null | undefined): string | undefined {
  if (!issues || (!issues.errors.length && !issues.warnings.length)) return undefined;
  return gprIssueTooltipText(issues);
}
