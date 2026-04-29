"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TMCSection } from "@/components/construction/TMCSection";
import type { ConstructionObjectScope } from "@/lib/gprUtils";

export default function ConstructionTmcPage() {
  const router = useRouter();
  const [activePartScope, setActivePartScope] = useState<ConstructionObjectScope>(1);

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 overflow-x-clip px-3 py-4 sm:px-4 md:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => router.push("/construction")}
          className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← К строительству
        </button>
      </div>
      <TMCSection activePartScope={activePartScope} onChangePartScope={setActivePartScope} />
    </section>
  );
}
