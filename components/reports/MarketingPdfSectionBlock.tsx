"use client";

import type { ReactNode } from "react";

import { formatMarketingPdfSectionMeta, type MarketingPdfSectionMeta } from "@/utils/pdf/marketingPdfSections";
import { MARKETING_PDF_BLOCK_ATTR } from "@/utils/pdf/marketingPdfRenderProps";

type Props = MarketingPdfSectionMeta & {
  children: ReactNode;
  className?: string;
  blockKey?: string;
};

/** PDF block wrapper: title metadata + page-break-safe capture root. */
export function MarketingPdfSectionBlock({
  sectionTitle,
  segmentLabel,
  modeLabel,
  monthLabel,
  children,
  className = "",
  blockKey,
}: Props) {
  const metaLine = formatMarketingPdfSectionMeta({ sectionTitle, segmentLabel, modeLabel, monthLabel });

  return (
    <section
      {...{ [MARKETING_PDF_BLOCK_ATTR]: true }}
      data-pdf-section-title={metaLine}
      data-marketing-pdf-block-key={blockKey}
      className={`marketing-pdf-section-block break-inside-avoid bg-white px-4 py-5 sm:px-6 ${className}`.trim()}
      style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <header className="mb-4 border-b border-slate-200/80 pb-3">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight text-slate-900">{sectionTitle}</h3>
        <p className="mt-1 text-[11px] font-medium leading-snug text-slate-500">
          {[segmentLabel ? `Сегмент: ${segmentLabel}` : null, modeLabel ? `Режим: ${modeLabel}` : null, monthLabel ? `Месяц: ${monthLabel}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
