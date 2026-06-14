"use client";

import { useLayoutEffect } from "react";

/**
 * Регистрация плагинов Chart.js только в браузере: не тянет chart.js в RSC-трей layout
 * и исключает редкие сбои при оценке модуля на сервере.
 */
export function ChartSetup() {
  useLayoutEffect(() => {
    void import("@/lib/chartSetup");
  }, []);
  return null;
}
