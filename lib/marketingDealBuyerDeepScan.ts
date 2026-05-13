/**
 * Рекурсивный обход JSON сделки для поиска buyer-related полей под произвольными ключами и вложенностью.
 * Не импортирует DealsSection — вызывается оттуда с `row: unknown`.
 */

import { isStaffDominatedPath } from "@/lib/marketingDealBuyerEntity";

const MAX_LEAVES = 900;
const MAX_ARRAY_ITEMS = 48;
const MAX_DEPTH = 22;

/** Узкий буст: только явные контейнеры покупателя (не `user` / `crm` / `contact` целиком — там часто сотрудники). */
const PATH_BUYER_CONTAINER = /\.(buyer|client|customer|person|applicant|purchaser|counterparty|tenant|payer)\b/i;

/** Путь похож на параметры квартиры / объекта — понижаем приоритет для ФИО/телефона. */
const PATH_OBJECT_STRONG = /\.object\.(name|title|label|code|number|flat|unit|typology|layout)\b/i;

const PATH_NAME_KEY =
  /(name_full|name_first|name_last|name_middle|full_?name|fio|surname|lastname|firstname|middlename|patronym|client_?name|buyer_?name|person_?name|contact_?name|display_?name)/i;

const PATH_PHONE_KEY = /(phone|mobile|tel|cell|gsm|whatsapp|viber)/i;

const PATH_EMAIL_KEY = /(e_?mail|mail\b|email)/i;

const PATH_BIRTH_KEY = /(birth|dob|date_?of_?birth|birthday)/i;

const PATH_CITY_KEY = /(city|town|locality|settlement|municipality|населен)/i;

const PATH_GENDER_KEY = /(gender|sex|пол\b)/i;

const PATH_MARITAL_KEY = /(marital|family_?status|wedding|spouse)/i;

const PATH_TYPE_KEY = /(buyer_?type|client_?type|customer_?type|person_?type|entity_?type|legal_?status|customerType|clientType)/i;

const PATH_BUDGET_KEY = /(budget|max_?budget|planned_?budget|purchase_?budget|willing|afford)/i;

const PATH_PAY_KEY = /(payment|pay_?type|pay_?method|financ|funding|installment|mortgage|ипотек|рассроч)/i;

const PATH_CHILD_KEY = /(children|kids|child_?count|dependant)/i;

const PATH_FAMILY_KEY = /(family|household)/i;

const PATH_INCOME_KEY = /(income|salary|revenue|earnings)/i;

const PATH_JOB_KEY = /(occupation|job|profession|work|position|employment)/i;

const PATH_PURCHASE_COUNT_KEY = /(purchase_?count|purchases|deals_?count|orders_?count)/i;

export type DeepBuyerPayment = "mortgage" | "installment" | "cash" | "mixed" | "unknown";

export type DeepBuyerAugment = {
  fullName?: string | null;
  buyerType?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  city?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  paymentLabel?: string | null;
  paymentCategory?: DeepBuyerPayment | null;
  budgetRub?: number | null;
  purchaseCount?: number | null;
  occupation?: string | null;
  children?: string | null;
  family?: string | null;
  income?: string | null;
};

function pathScore(path: string): number {
  if (isStaffDominatedPath(path)) return -120;
  const p = path.toLowerCase();
  let s = 0;
  if (PATH_BUYER_CONTAINER.test(p)) s += 50;
  if (PATH_OBJECT_STRONG.test(p)) s -= 35;
  return s;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function looksLikePhone(s: string): boolean {
  const d = digitsOnly(s);
  return d.length >= 10 && d.length <= 15;
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/i.test(s.trim());
}

function looksLikeBirthYmd(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(t);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return null;
}

function parseRubishNumber(s: string): number | null {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function classifyPaymentDeep(raw: string): { label: string; category: DeepBuyerPayment } {
  const label = raw.trim();
  const t = label.toLowerCase();
  const hasM = /ипотек|mortgage|\bmort\b|кредит|залог/i.test(t);
  const hasI = /рассроч|installment|расср|install/i.test(t);
  const hasC = /наличн|\bcash\b|свои\s*ден|100\s*%|полная\s*оплат/i.test(t);
  if (hasM && hasI) return { label, category: "mixed" };
  if (hasM) return { label, category: "mortgage" };
  if (hasI) return { label, category: "installment" };
  if (hasC) return { label, category: "cash" };
  return { label, category: "unknown" };
}

function walk(
  node: unknown,
  path: string,
  depth: number,
  budget: { n: number },
  out: Array<{ path: string; key: string; value: string; score: number }>,
): void {
  if (budget.n <= 0 || depth > MAX_DEPTH) return;

  if (node == null) return;

  if (typeof node === "string") {
    const v = node.trim();
    if (v.length > 0 && v.length < 400) {
      out.push({ path, key: path.split(".").pop() ?? path, value: v, score: pathScore(path) });
      budget.n--;
    }
    return;
  }

  if (typeof node === "number" && Number.isFinite(node)) {
    out.push({ path, key: path.split(".").pop() ?? path, value: String(node), score: pathScore(path) });
    budget.n--;
    return;
  }

  if (typeof node === "boolean") return;

  if (Array.isArray(node)) {
    const lim = Math.min(node.length, MAX_ARRAY_ITEMS);
    for (let i = 0; i < lim; i++) {
      walk(node[i], path ? `${path}[${i}]` : `[${i}]`, depth + 1, budget, out);
      if (budget.n <= 0) return;
    }
    return;
  }

  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const next = path ? `${path}.${k}` : k;
      walk(o[k], next, depth + 1, budget, out);
      if (budget.n <= 0) return;
    }
  }
}

function pickBest(leaves: Array<{ path: string; key: string; value: string; score: number }>, pred: (l: (typeof leaves)[0]) => number): (typeof leaves)[0] | null {
  let best: (typeof leaves)[0] | null = null;
  let bestS = -Infinity;
  for (const l of leaves) {
    const bonus = pred(l);
    if (bonus < -1e6) continue;
    const s = l.score + bonus;
    if (s > bestS) {
      bestS = s;
      best = l;
    }
  }
  return best;
}

/**
 * Рекурсивно сканирует строку выгрузки и возвращает дополнения к профилю покупателя.
 */
export function deepScanBuyerAugments(row: unknown): DeepBuyerAugment {
  const budget = { n: MAX_LEAVES };
  const rawLeaves: Array<{ path: string; key: string; value: string; score: number }> = [];
  walk(row, "", 0, budget, rawLeaves);

  const aug: DeepBuyerAugment = {};

  const phoneLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (looksLikePhone(l.value)) return PATH_PHONE_KEY.test(l.path) ? 80 : 50;
    if (PATH_PHONE_KEY.test(l.path) && l.value.length >= 8) return 30;
    return -1e9;
  });
  if (phoneLeaf) aug.phone = phoneLeaf.value;

  const emailLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    return looksLikeEmail(l.value) ? (PATH_EMAIL_KEY.test(l.path) ? 80 : 55) : -1e9;
  });
  if (emailLeaf) aug.email = emailLeaf.value;

  const birthLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    const ymd = looksLikeBirthYmd(l.value);
    if (!ymd) return -1e9;
    return PATH_BIRTH_KEY.test(l.path) ? 90 : 50;
  });
  if (birthLeaf) {
    const ymd = looksLikeBirthYmd(birthLeaf.value);
    if (ymd) aug.birthDate = ymd;
  }

  const nameLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (looksLikePhone(l.value) || looksLikeEmail(l.value)) return -1e9;
    if (l.value.length < 3 || l.value.length > 200) return -1e9;
    if (/^\d+[\s,.]*$/.test(l.value)) return -1e9;
    let b = 0;
    if (/name_first|name_last|name_middle|name_full/i.test(l.path)) b += 110;
    if (PATH_NAME_KEY.test(l.path)) b += 100;
    if (PATH_BUYER_CONTAINER.test(l.path)) b += 45;
    if (PATH_OBJECT_STRONG.test(l.path)) b -= 120;
    if (/deal\.client_name$/i.test(l.path)) b += 30;
    if (/object\.name$/i.test(l.path) && !PATH_BUYER_CONTAINER.test(l.path)) b -= 80;
    return b;
  });
  if (nameLeaf) aug.fullName = nameLeaf.value;

  const typeLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (looksLikePhone(l.value) || looksLikeEmail(l.value)) return -1e9;
    if (l.value.length > 120) return -1e9;
    return PATH_TYPE_KEY.test(l.path) ? 90 : -1e9;
  });
  if (typeLeaf) aug.buyerType = typeLeaf.value;

  const cityLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (/\.object\./i.test(l.path)) return -1e9;
    if (looksLikePhone(l.value) || looksLikeEmail(l.value)) return -1e9;
    if (l.value.length > 80) return -1e9;
    return PATH_CITY_KEY.test(l.path) ? 85 : -1e9;
  });
  if (cityLeaf) aug.city = cityLeaf.value;

  const genderLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 32) return -1e9;
    return PATH_GENDER_KEY.test(l.path) ? 85 : -1e9;
  });
  if (genderLeaf) aug.gender = genderLeaf.value;

  const maritalLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 80) return -1e9;
    return PATH_MARITAL_KEY.test(l.path) ? 85 : -1e9;
  });
  if (maritalLeaf) aug.maritalStatus = maritalLeaf.value;

  const payLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (looksLikePhone(l.value) || looksLikeEmail(l.value)) return -1e9;
    if (l.value.length > 200) return -1e9;
    if (!PATH_PAY_KEY.test(l.path) && !/ипотек|рассроч|mortgage|installment|cash|налич/i.test(l.value)) return -1e9;
    return PATH_PAY_KEY.test(l.path) ? 90 : 40;
  });
  if (payLeaf) {
    const { label, category } = classifyPaymentDeep(payLeaf.value);
    aug.paymentLabel = label;
    aug.paymentCategory = category;
  }

  const budgetLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    const n = parseRubishNumber(l.value);
    if (n == null || n < 10_000) return -1e9;
    return PATH_BUDGET_KEY.test(l.path) ? 90 : 35;
  });
  if (budgetLeaf) {
    const n = parseRubishNumber(budgetLeaf.value);
    if (n != null) aug.budgetRub = n;
  }

  const pcLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    const n = parseInt(l.value.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 0 || n > 500) return -1e9;
    return PATH_PURCHASE_COUNT_KEY.test(l.path) ? 85 : -1e9;
  });
  if (pcLeaf) {
    const n = parseInt(pcLeaf.value.replace(/\D/g, ""), 10);
    if (Number.isFinite(n)) aug.purchaseCount = n;
  }

  const occLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 120) return -1e9;
    return PATH_JOB_KEY.test(l.path) ? 85 : -1e9;
  });
  if (occLeaf) aug.occupation = occLeaf.value;

  const chLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 40) return -1e9;
    return PATH_CHILD_KEY.test(l.path) ? 85 : -1e9;
  });
  if (chLeaf) aug.children = chLeaf.value;

  const famLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 120) return -1e9;
    return PATH_FAMILY_KEY.test(l.path) ? 80 : -1e9;
  });
  if (famLeaf) aug.family = famLeaf.value;

  const incLeaf = pickBest(rawLeaves, (l) => {
    if (isStaffDominatedPath(l.path)) return -1e9;
    if (l.value.length > 80) return -1e9;
    return PATH_INCOME_KEY.test(l.path) ? 85 : -1e9;
  });
  if (incLeaf) aug.income = incLeaf.value;

  return aug;
}

function mergePreferFirst<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a != null && String(a).trim() !== "") return a as T;
  if (b != null && String(b).trim() !== "") return b as T;
  return (a ?? b) as T | null;
}

function mergeNum(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a != null && Number.isFinite(a) && a > 0) return a;
  if (b != null && Number.isFinite(b) && b > 0) return b;
  return null;
}

/**
 * Дополняет профиль результатами глубокого сканирования (только пустые поля).
 */
export function mergeBuyerProfileWithDeepScan<
  T extends {
    fullName: string | null;
    buyerType: string | null;
    phone: string | null;
    email: string | null;
    birthDate: string | null;
    city: string | null;
    gender: string | null;
    maritalStatus: string | null;
    paymentLabel: string | null;
    paymentCategory: string | null;
    purchaseCount: number | null;
    budgetRub: number | null;
    occupation: string | null;
    children: string | null;
    family: string | null;
    income: string | null;
    hasRichFields: boolean;
  },
>(row: unknown, base: T, classifyPayment: (raw: string | null) => { label: string | null; category: T["paymentCategory"] }): T {
  const d = deepScanBuyerAugments(row);

  const deepPayLabel = d.paymentLabel != null && String(d.paymentLabel).trim() !== "" ? String(d.paymentLabel).trim() : null;
  const mergedPaymentLabel = mergePreferFirst(base.paymentLabel, deepPayLabel);
  const baseCat = base.paymentCategory;
  const hasSolidBaseCat = baseCat != null && String(baseCat) !== "unknown";
  let paymentCategory = baseCat;
  if (!hasSolidBaseCat && mergedPaymentLabel != null && String(mergedPaymentLabel).trim() !== "") {
    const c = classifyPayment(String(mergedPaymentLabel).trim()).category;
    paymentCategory = (c ?? baseCat) as T["paymentCategory"];
  }

  const merged: T = {
    ...base,
    fullName: mergePreferFirst(base.fullName, d.fullName ?? null),
    buyerType: mergePreferFirst(base.buyerType, d.buyerType ?? null),
    phone: mergePreferFirst(base.phone, d.phone ?? null),
    email: mergePreferFirst(base.email, d.email ?? null),
    birthDate: mergePreferFirst(base.birthDate, d.birthDate ?? null),
    city: mergePreferFirst(base.city, d.city ?? null),
    gender: mergePreferFirst(base.gender, d.gender ?? null),
    maritalStatus: mergePreferFirst(base.maritalStatus, d.maritalStatus ?? null),
    paymentLabel: mergedPaymentLabel,
    paymentCategory,
    budgetRub: mergeNum(base.budgetRub, d.budgetRub) ?? base.budgetRub,
    purchaseCount: mergeNum(base.purchaseCount, d.purchaseCount) ?? base.purchaseCount,
    occupation: mergePreferFirst(base.occupation, d.occupation ?? null),
    children: mergePreferFirst(base.children, d.children ?? null),
    family: mergePreferFirst(base.family, d.family ?? null),
    income: mergePreferFirst(base.income, d.income ?? null),
    hasRichFields: base.hasRichFields,
  };

  merged.hasRichFields = [
    merged.fullName,
    merged.buyerType,
    merged.phone,
    merged.email,
    merged.birthDate,
    merged.city,
    merged.gender,
    merged.maritalStatus,
    merged.paymentLabel,
    merged.occupation,
    merged.children,
    merged.family,
    merged.income,
  ].some((x) => x != null && String(x).trim() !== "") ||
    (merged.budgetRub != null && merged.budgetRub > 0) ||
    (merged.purchaseCount != null && merged.purchaseCount > 0);

  return merged;
}

/**
 * Dev: лог структуры JSON при отсутствии богатых buyer-полей.
 * Включить: `localStorage.setItem('DEBUG_DEAL_BUYER','1')` в консоли браузера, затем перезагрузить.
 */
export function logBuyerJsonDebugIfEnabled(row: unknown, mergedHasRich: boolean): void {
  if (typeof window === "undefined" || mergedHasRich) return;
  const envOn = typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_DEAL_BUYER === "1";
  let lsOn = false;
  try {
    lsOn = window.localStorage.getItem("DEBUG_DEAL_BUYER") === "1";
  } catch {
    /* ignore */
  }
  if (!envOn && !lsOn) return;
  const top = row != null && typeof row === "object" && !Array.isArray(row) ? Object.keys(row as object) : [];
  const budget = { n: 120 };
  const leaves: Array<{ path: string; key: string; value: string; score: number }> = [];
  walk(row, "", 0, budget, leaves);
  const interesting = [...leaves]
    .filter(
      (l) =>
        !isStaffDominatedPath(l.path) &&
        (PATH_BUYER_CONTAINER.test(l.path) || PATH_PHONE_KEY.test(l.path) || PATH_EMAIL_KEY.test(l.path) || PATH_NAME_KEY.test(l.path)),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);
  console.log("[deal-buyer-debug] JSON TOP LEVEL KEYS", top);
  console.log("[deal-buyer-debug] sample scored paths (first row)", interesting);
}
