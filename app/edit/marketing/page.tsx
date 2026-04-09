"use client";

import { useRouter } from "next/navigation";

import { EditLayout } from "@/components/EditLayout";
import { MarketingWorkspace } from "@/components/marketing/MarketingWorkspace";

export default function EditMarketingPage() {
  const router = useRouter();

  return (
    <main className="mx-auto min-h-[60vh] w-full min-w-0 max-w-[1400px] bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <EditLayout
        title="Маркетинг"
        subtitle="План продаж и рассрочка ДДУ (mock-данные, готово к подключению API)"
        onSave={() => {}}
        onCancel={() => {}}
      >
        <MarketingWorkspace
          presentation={false}
          modeLabel="Редактирование"
          onBackToBlocks={() => router.push("/edit")}
        />
      </EditLayout>
    </main>
  );
}
