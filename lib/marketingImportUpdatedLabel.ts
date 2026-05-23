/** Формат подписи «Последнее обновление: 23.05.2026 22:31». */
export function formatMarketingImportUpdatedLabel(
  updatedAt: string | null | undefined,
  uploadedBy?: string | null,
): string | null {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const who = uploadedBy?.trim();
  if (who && who !== "—") {
    return `Последнее обновление: ${date} ${time} · ${who}`;
  }
  return `Последнее обновление: ${date} ${time}`;
}
