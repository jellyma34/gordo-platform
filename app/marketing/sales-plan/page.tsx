import { redirect } from "next/navigation";

/** Вход в цикл плана продаж без подпути — по умолию рабочий режим. */
export default function MarketingSalesPlanIndexPage() {
  redirect("/marketing/sales-plan/work");
}
