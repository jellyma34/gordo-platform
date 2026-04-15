import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Совместимость: старый путь презентации маркетинга → канонический SPA-маршрут. */
export default async function LegacyPresentationMarketingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) val.forEach((v) => q.append(key, v));
    else q.set(key, val);
  }
  const tail = q.toString();
  redirect(tail ? `/presentation/marketing/sales-plan?${tail}` : "/presentation/marketing/sales-plan");
}
