import { HomeErrorBoundary } from "@/components/home/HomeErrorBoundary";

import { HomePage } from "./home-client";

/**
 * Корень `/`: HTML-оболочка (healthcheck / Railway) + клиентский выбор режима.
 * Ошибки рендера дочерних — в HomeErrorBoundary; сегмента `error.tsx` — в `app/error.tsx`.
 */
export default function Page() {
  return (
    <HomeErrorBoundary>
      <HomePage />
    </HomeErrorBoundary>
  );
}
