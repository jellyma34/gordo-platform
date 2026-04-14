"use client";

import { useRef } from "react";

import { EditLayout } from "@/components/EditLayout";
import { SalesPlanWorkMode, type SalesPlanWorkModeHandle } from "@/components/marketing/SalesPlanWorkMode";
import { SALES_PLAN_SPA } from "@/lib/salesPlanSpaRoutes";

export default function MarketingSalesPlanWorkPage() {
  const workRef = useRef<SalesPlanWorkModeHandle>(null);

  return (
    <main className="mx-auto min-h-[60vh] w-full min-w-0 max-w-[1400px] bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <EditLayout
        title="План продаж — рабочий режим"
        subtitle="Сценарии база / обновлённый / прогноз, метрики шт. и выручка и средняя цена, таблица план/факт и журнал изменений (локальное хранение до API)."
        onSave={() => workRef.current?.save() ?? Promise.resolve()}
        onCancel={() => workRef.current?.cancel()}
      >
        <SalesPlanWorkMode ref={workRef} dashboardHref={SALES_PLAN_SPA.presentation} />
      </EditLayout>
    </main>
  );
}
