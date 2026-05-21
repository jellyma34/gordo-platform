"use client";

import { InstallmentDduPanel } from "@/components/marketing/InstallmentDduPanel";

/**
 * Раздел «Рассрочка ДДУ» в рабочем режиме маркетинга.
 */
export function InstallmentsSection() {
  return <InstallmentDduPanel presentation={false} period="month" objectId="all" />;
}
