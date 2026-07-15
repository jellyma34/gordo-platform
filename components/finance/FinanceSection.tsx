"use client";

import { useRef } from "react";

import { EditLayout } from "@/components/EditLayout";
import { useAppMode } from "@/components/mode/ModeProvider";
import { FinanceBudgetTable, type FinanceBudgetTableHandle } from "@/components/finance/FinanceBudgetTable";
import { FinancePresentation } from "@/components/finance/FinancePresentation";

export function FinanceSection() {
  const { mode } = useAppMode();
  const tableRef = useRef<FinanceBudgetTableHandle>(null);

  if (mode === "presentation") {
    return <FinancePresentation />;
  }

  return (
    <EditLayout
      title="Экономика и финансы"
      subtitle="Бюджет проекта и исполнение бюджета — два независимых CSV-импорта."
      onSave={() => tableRef.current?.save()}
      onCancel={() => tableRef.current?.cancel()}
    >
      <FinanceBudgetTable ref={tableRef} embedded />
    </EditLayout>
  );
}
