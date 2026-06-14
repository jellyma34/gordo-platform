import { redirect } from "next/navigation";

/** Старый URL: перенаправление на канонический маршрут рабочего режима. */
export default function MarketingPlanEditRedirectPage() {
  redirect("/marketing/sales-plan/work");
}
