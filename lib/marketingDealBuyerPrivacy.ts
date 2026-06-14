/** Маскирование телефона для предпросмотра (не полная анонимизация). */
export function maskPhoneDisplay(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const raw = String(phone).trim();
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 4) return "***";
  const tail4 = d.slice(-4);
  const a = tail4.slice(0, 2);
  const b = tail4.slice(2);
  if (d.length >= 10 && (d.startsWith("7") || d.startsWith("8"))) {
    return `+7 *** *** ${a} ${b}`;
  }
  return `*** *** ${a} ${b}`;
}

/** Частичное скрытие e-mail. */
export function maskEmailDisplay(email: string | null | undefined): string | null {
  if (email == null) return null;
  const raw = String(email).trim().toLowerCase();
  if (!raw || !raw.includes("@")) return null;
  const [u, dom] = raw.split("@");
  if (!u || !dom) return null;
  const vis = u.slice(0, Math.min(2, u.length));
  return `${vis}***@${dom}`;
}

/** Возраст (полных лет) по дате рождения YYYY-MM-DD. */
export function buyerAgeYearsFromYmd(birthYmd: string | null | undefined): number | null {
  if (birthYmd == null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthYmd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const birth = new Date(y, mo, d);
  if (!Number.isFinite(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
