import type { ReactNode } from "react";

/** Единый стиль легенд аналитики: круглый маркер + подпись (+ опционально значение). */
const LABEL_STYLE = {
  color: "#E6EDF3",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.25,
} as const;

const MARKER_PX = 9;
const MARKER_LABEL_GAP_PX = 8;
export function AnalyticsLegendItem({
  markerColor,
  label,
  value,
}: {
  markerColor: string;
  label: ReactNode;
  value?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 w-full items-center justify-between gap-3">
      <span className="flex min-w-0 items-center" style={{ gap: MARKER_LABEL_GAP_PX }}>
        <span
          className="shrink-0 rounded-full"
          style={{
            width: MARKER_PX,
            height: MARKER_PX,
            backgroundColor: markerColor,
          }}
          aria-hidden
        />
        <span className="min-w-0 truncate font-medium" style={LABEL_STYLE}>
          {label}
        </span>
      </span>
      {value != null ? (
        <span className="shrink-0 tabular-nums font-medium" style={LABEL_STYLE}>
          {value}
        </span>
      ) : null}
    </div>
  );
}

/** Вертикальный список строк легенды с одинаковым межстрочным интервалом (10–12px). */
export function AnalyticsLegendList({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-[11px]">{children}</div>;
}
