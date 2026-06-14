import type { GPRItem } from "./gprData";

/** Пользовательские позиции в выпадающем списке (группа «Пользовательские»). */
export type GprWorkCatalogItem = GPRItem & { group: "Пользовательские" };
