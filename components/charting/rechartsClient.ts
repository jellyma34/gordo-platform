"use client";

/**
 * Статическая точка входа в recharts.
 * Меньше отдельных async-чанков, чем у множества `dynamic(() => import("recharts"))` —
 * снижает риск «Cannot find module './5611.js'» при HMR/устаревшем .next.
 *
 * Все импорты recharts (компоненты, хуки, типы) — только отсюда, не из "recharts" напрямую:
 * иначе optimizePackageImports и rechartsClient дают два графа модулей и битые ссылки на чанки.
 */
export type { XAxisTickContentProps } from "recharts";
export {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
