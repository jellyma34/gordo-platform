"use client";

import { useEffect, useMemo, useState } from "react";
import { TMC_MATERIAL_IMAGE_MANIFEST } from "@/lib/tmcMaterialImagesManifest.generated";
import {
  nextTmcMaterialImageCandidate,
  resolveTmcMaterialImageSrc,
  TMC_MATERIAL_IMAGE_PLACEHOLDER,
} from "@/lib/tmcMaterialImages";

type TmcMaterialCellProps = {
  name: string;
  className?: string;
};

/** Миниатюра материала + название (колонка «Материал» в «План на месяц»). */
export function TmcMaterialCell({ name, className = "" }: TmcMaterialCellProps) {
  const label = name?.trim() || "—";
  const manifest = TMC_MATERIAL_IMAGE_MANIFEST;
  const initialSrc = useMemo(
    () => resolveTmcMaterialImageSrc(label, manifest),
    [label, manifest],
  );
  const [src, setSrc] = useState(initialSrc);

  useEffect(() => {
    setSrc(initialSrc);
  }, [initialSrc]);

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <div
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-slate-800/80 ring-1 ring-inset ring-white/10"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => {
            setSrc((current) => nextTmcMaterialImageCandidate(label, current, manifest));
          }}
        />
      </div>
      <span className="min-w-0 line-clamp-2 break-words leading-snug">{label}</span>
    </div>
  );
}
