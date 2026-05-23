"use client";

/**
 * Статическая точка входа в recharts.
 * Меньше отдельных async-чанков, чем у множества `dynamic(() => import("recharts"))` —
 * снижает риск «Cannot find module './611.js'» при HMR/устаревшем .next.
 */
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
} from "recharts";
