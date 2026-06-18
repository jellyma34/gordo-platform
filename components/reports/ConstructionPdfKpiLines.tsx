import { PDF_KPI_LINE_ATTR, PDF_KPI_LINES_ATTR } from "@/lib/pdf/constructionPdfConstants";

/** Скрытые строки KPI для PDF-экспорта (читаются из DOM). */
export function ConstructionPdfKpiLines({ lines }: { lines: string[] }) {
  const visible = lines.filter((line) => line.trim().length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="sr-only" aria-hidden {...{ [PDF_KPI_LINES_ATTR]: "" }}>
      {lines.map((line, index) =>
        line.trim() ? (
          <div key={`${index}-${line}`} {...{ [PDF_KPI_LINE_ATTR]: "" }}>
            {line}
          </div>
        ) : null,
      )}
    </div>
  );
}
