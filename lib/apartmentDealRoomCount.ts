/** Число комнат из `object.estate_rooms` / `plans_name` (К1, К2, …). */
export function extractApartmentRoomCountFromObject(
  ob: Record<string, unknown> | null | undefined,
): number | null {
  if (ob == null || typeof ob !== "object") return null;

  const studia = ob.estate_studia;
  if (studia === 1 || studia === "1" || studia === true) return 1;

  const raw = ob.estate_rooms;
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw.replace(",", "."))
        : NaN;
  if (Number.isFinite(n) && n >= 1) {
    return Math.min(20, Math.floor(n));
  }

  const plans = String(ob.plans_name ?? "").trim();
  const m = /^к(\d+)/i.exec(plans.replace(/ё/g, "е"));
  if (m) {
    const r = Number(m[1]);
    if (Number.isFinite(r) && r >= 1) return Math.min(20, Math.floor(r));
  }

  return null;
}

