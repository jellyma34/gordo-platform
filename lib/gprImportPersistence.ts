/** Идентификатор проекта (переопределить через NEXT_PUBLIC_GPR_PROJECT_ID). */
export function getGprProjectId(): string {
  const v =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_GPR_PROJECT_ID != null
      ? String(process.env.NEXT_PUBLIC_GPR_PROJECT_ID).trim()
      : "";
  return v.length > 0 ? v : "default";
}
