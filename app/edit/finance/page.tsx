"use client";

import { EditLayout } from "@/components/EditLayout";

export default function EditFinancePage() {
  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl bg-slate-50 p-4 md:p-6">
      <EditLayout
        title="Экономика и финансы"
        subtitle="Редактирование данных раздела"
        onSave={() => {}}
        onCancel={() => {}}
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-6 text-sm text-slate-600">
          Раздел в разработке.
        </div>
      </EditLayout>
    </main>
  );
}
