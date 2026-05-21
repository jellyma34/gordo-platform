/** Визуальная тема KPI-блока «Выполнение плана отчётного периода». */
export type EntityKpiThemeId = "apartments" | "parking" | "storages" | "installment_area";

export type EntityKpiTheme = {
  id: EntityKpiThemeId;
  planGradient: string;
  factGradient: string;
  factTooltipColor: string;
  factBarShadow: string;
  ringTrackBorder: string;
  ringStrokeDark: string;
  ringGradientStops: { top: string; bottom: string };
};

export const APARTMENT_KPI_THEME: EntityKpiTheme = {
  id: "apartments",
  planGradient: "linear-gradient(180deg, #FFB257 0%, #FF7A00 100%)",
  factGradient: "linear-gradient(180deg, #5EA0FF 0%, #2563EB 100%)",
  factTooltipColor: "#1D4ED8",
  factBarShadow: "0 3px 10px rgba(37,99,235,0.1)",
  ringTrackBorder: "#EEF2FF",
  ringStrokeDark: "#3B82F6",
  ringGradientStops: { top: "#5EA0FF", bottom: "#2563EB" },
};

export const PARKING_KPI_THEME: EntityKpiTheme = {
  id: "parking",
  planGradient: "linear-gradient(180deg, #FFB257 0%, #FF7A00 100%)",
  factGradient: "linear-gradient(180deg, #C4B5FD 0%, #7C3AED 100%)",
  factTooltipColor: "#7C3AED",
  factBarShadow: "0 3px 10px rgba(124,58,237,0.18)",
  ringTrackBorder: "#EDE9FE",
  ringStrokeDark: "#8B5CF6",
  ringGradientStops: { top: "#C4B5FD", bottom: "#7C3AED" },
};

/** Кладовые: план — cyan, факт — тёмный navy (не purple parking). */
/** Площадь, кв.м — блок «Рассрочка ДДУ». */
export const INSTALLMENT_AREA_KPI_THEME: EntityKpiTheme = {
  id: "installment_area",
  planGradient: "linear-gradient(180deg, #FFB257 0%, #FF7A00 100%)",
  factGradient: "linear-gradient(180deg, #5EEAD4 0%, #0D9488 100%)",
  factTooltipColor: "#0F766E",
  factBarShadow: "0 3px 10px rgba(13,148,136,0.18)",
  ringTrackBorder: "#CCFBF1",
  ringStrokeDark: "#0D9488",
  ringGradientStops: { top: "#5EEAD4", bottom: "#0D9488" },
};

export const STORAGE_KPI_THEME: EntityKpiTheme = {
  id: "storages",
  planGradient: "linear-gradient(180deg, #67E8F9 0%, #06B6D4 100%)",
  factGradient: "linear-gradient(180deg, #475569 0%, #0F172A 100%)",
  factTooltipColor: "#0F172A",
  factBarShadow: "0 3px 10px rgba(15,23,42,0.22)",
  ringTrackBorder: "#E0F2FE",
  ringStrokeDark: "#1E293B",
  ringGradientStops: { top: "#64748B", bottom: "#0F172A" },
};
