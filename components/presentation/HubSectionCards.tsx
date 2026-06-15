"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight, HardHat, LineChart, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StatusTone } from "@/lib/homeDashboardSnapshot";

const statusDotClass: Record<StatusTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
};

const statusTitle: Record<StatusTone, string> = {
  green: "В норме",
  yellow: "Внимание",
  red: "Требует внимания",
};

export type HubBlock = {
  title: string;
  /** Одна строка */
  description: string;
  href: string;
  status: StatusTone;
};

type SectionTheme = {
  Icon: LucideIcon;
  glowColor: string;
  waveColor: string;
  gradient: string;
};

const PREMIUM_THEMES: Record<string, SectionTheme> = {
  Строительство: {
    Icon: HardHat,
    glowColor: "#a855f7",
    waveColor: "#a855f7",
    gradient:
      "linear-gradient(155deg, rgba(168,85,247,0.22) 0%, rgba(30,27,75,0.42) 38%, rgba(11,18,32,0.78) 100%)",
  },
  Маркетинг: {
    Icon: LineChart,
    glowColor: "#818cf8",
    waveColor: "#6366f1",
    gradient:
      "linear-gradient(155deg, rgba(99,102,241,0.24) 0%, rgba(30,27,75,0.42) 38%, rgba(11,18,32,0.78) 100%)",
  },
  Финансы: {
    Icon: Wallet,
    glowColor: "#38bdf8",
    waveColor: "#22d3ee",
    gradient:
      "linear-gradient(155deg, rgba(56,189,248,0.2) 0%, rgba(15,40,71,0.4) 38%, rgba(11,18,32,0.78) 100%)",
  },
};

const DEFAULT_THEME: SectionTheme = PREMIUM_THEMES["Финансы"];

type Props = {
  blocks: readonly HubBlock[];
  gridClassName?: string;
  variant?: "default" | "presentation";
};

function HubCardWaveGrid({ color }: { color: string }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `hub-grad-${uid}`;
  const gridId = `hub-grid-${uid}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[52%]">
      <svg viewBox="0 0 460 180" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.38" />
            <stop offset="55%" stopColor={color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <pattern id={gridId} width="28" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke={color}
              strokeOpacity="0.16"
              strokeWidth="0.75"
            />
          </pattern>
        </defs>
        <rect x="0" y="24" width="460" height="156" fill={`url(#${gridId})`} opacity="0.85" />
        <path
          d="M0,72 C72,108 148,44 232,76 S360,104 460,68 L460,180 L0,180 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M0,88 C96,104 188,58 284,82 S392,98 460,78"
          fill="none"
          stroke={color}
          strokeOpacity="0.32"
          strokeWidth="1.5"
        />
        <path
          d="M0,104 C110,118 210,86 310,108 S400,114 460,96"
          fill="none"
          stroke={color}
          strokeOpacity="0.18"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function PremiumHubCard({ block }: { block: HubBlock }) {
  const theme = PREMIUM_THEMES[block.title] ?? DEFAULT_THEME;
  const { Icon, glowColor, waveColor, gradient } = theme;

  return (
    <Link
      href={block.href}
      scroll
      className="hub-premium-card group relative flex min-h-[300px] w-full max-w-[460px] cursor-pointer flex-col overflow-hidden rounded-[22px] border no-underline backdrop-blur-[18px] transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/50"
      style={{
        background: gradient,
        borderColor: `${glowColor}40`,
        boxShadow: `0 18px 52px rgba(0,0,0,0.48), 0 0 36px ${glowColor}16, inset 0 1px 0 rgba(255,255,255,0.1)`,
        ["--hub-glow" as string]: glowColor,
      }}
      aria-label={`Перейти: ${block.title}`}
    >
      <HubCardWaveGrid color={waveColor} />

      <div className="relative z-[1] flex h-full min-h-[300px] flex-col p-6 md:min-h-[340px] md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 backdrop-blur-sm"
            style={{
              background: `${glowColor}1a`,
              color: glowColor,
              boxShadow: `0 0 24px ${glowColor}22`,
              borderColor: `${glowColor}30`,
            }}
          >
            <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>

          <span
            className="hub-premium-arrow flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[transform,background-color,box-shadow] duration-300 ease-out group-hover:border-white/20 group-hover:bg-white/[0.14]"
            aria-hidden
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2} />
          </span>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[block.status]}`}
              title={statusTitle[block.status]}
              aria-hidden
            />
            <h2 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">{block.title}</h2>
          </div>
          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-slate-300/85 md:text-[15px]">
            {block.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Навигационные карточки разделов: клик по всей области ведёт в маршрут (Link), без KPI внутри.
 */
export function HubSectionCards({
  blocks,
  gridClassName = "hub-section-grid",
  variant = "default",
}: Props) {
  if (variant === "presentation") {
    return (
      <section className={gridClassName} aria-label="Разделы платформы">
        {blocks.map((block) => (
          <PremiumHubCard key={block.href} block={block} />
        ))}
      </section>
    );
  }

  return (
    <section className={gridClassName} aria-label="Разделы платформы">
      {blocks.map((block) => (
        <Link
          key={block.href}
          href={block.href}
          scroll
          className={[
            "group relative block cursor-pointer overflow-hidden rounded-xl no-underline",
            "border border-slate-600/40 bg-slate-900/90 p-4 shadow-md ring-0",
            "transition duration-200 ease-out will-change-transform",
            "hover:z-[1] hover:scale-[1.02] hover:border-slate-500/60 hover:bg-slate-900",
            "hover:shadow-lg hover:shadow-cyan-500/20",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/60",
            "md:p-5",
          ].join(" ")}
          aria-label={`Перейти: ${block.title}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass[block.status]}`}
                  title={statusTitle[block.status]}
                  aria-hidden
                />
                <h2 className="text-lg font-semibold tracking-tight text-slate-50 md:text-xl">{block.title}</h2>
              </div>
              <p className="mt-2 line-clamp-1 text-sm leading-snug text-slate-400">{block.description}</p>
            </div>
            <span
              className="shrink-0 pt-0.5 text-xl font-light text-slate-500 transition-colors group-hover:text-cyan-400"
              aria-hidden
            >
              →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
