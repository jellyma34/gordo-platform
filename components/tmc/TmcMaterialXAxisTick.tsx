"use client";

import type { XAxisTickContentProps } from "@/components/charting/rechartsClient";
import {
  splitTmcMaterialAxisLabel,
  TMC_MATERIAL_AXIS_TICK_FONT_SIZE,
  TMC_MATERIAL_AXIS_TICK_LINE_HEIGHT,
} from "@/lib/tmcMaterialAxisLabels";

export type TmcMaterialXAxisTickOptions = {
  angle?: number;
  textAnchor?: "start" | "middle" | "end";
  fill?: string;
  fontSize?: number;
  translateY?: number;
};

/**
 * Recharts 3: tick — функция `(props) => JSX`, не React-комponent.
 * См. createMarketingDealsStyleMonthTickRenderer.
 */
export function createTmcMaterialXAxisTick(
  options: TmcMaterialXAxisTickOptions = {},
): (props: XAxisTickContentProps) => JSX.Element {
  const {
    angle = 0,
    textAnchor: textAnchorOpt,
    fill = "#94a3b8",
    fontSize = TMC_MATERIAL_AXIS_TICK_FONT_SIZE,
    translateY = 0,
  } = options;
  const textAnchor = textAnchorOpt ?? (angle === 0 ? "middle" : "end");

  return function TmcMaterialXAxisTickRenderer(props: XAxisTickContentProps) {
    const { x, y, payload } = props;
    const xf = typeof x === "number" ? x : Number(x);
    const yf = typeof y === "number" ? y : Number(y);
    if (!Number.isFinite(xf) || !Number.isFinite(yf)) {
      return <g />;
    }

    const lines = splitTmcMaterialAxisLabel(String(payload?.value ?? ""));
    const rotate = angle !== 0 ? ` rotate(${angle})` : "";

    return (
      <g transform={`translate(${xf},${yf + translateY})${rotate}`}>
        <text fill={fill} fontSize={fontSize} textAnchor={textAnchor}>
          {lines.map((line, index) => (
            <tspan
              key={`${index}-${line}`}
              x={0}
              dy={index === 0 ? 0 : TMC_MATERIAL_AXIS_TICK_LINE_HEIGHT}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };
}
