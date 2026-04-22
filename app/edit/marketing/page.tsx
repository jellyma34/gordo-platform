"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { EditLayout } from "@/components/EditLayout";
import { MarketingWorkspace } from "@/components/marketing/MarketingWorkspace";

export default function EditMarketingPage() {
  const router = useRouter();
  const onBackToBlocks = useCallback(() => {
    router.push("/edit");
  }, [router]);

  return (
    <div className="min-h-0 min-w-0 bg-slate-50 px-3 py-4 sm:px-4 md:p-6">
      <EditLayout
        title="Маркетинг"
        subtitle="План продаж и рассрочка ДДУ (mock-данные, готово к подключению API)"
        onSave={() => {}}
        onCancel={() => {}}
      >
        <MarketingWorkspace presentation={false} modeLabel="Редактирование" onBackToBlocks={onBackToBlocks} />
      </EditLayout>
    </div>
  );
}
