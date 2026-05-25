/** Базовый URL для static CSV (Next.js `public/` → `/data/analytics/…`). */
export const ANALYTICS_CSV_PUBLIC_BASE = "/data/analytics";

/**
 * Абсолютный URL для fetch на клиенте или server-side HTTP fallback.
 * Учитывает NEXT_PUBLIC_BASE_PATH, если приложение развёрнуто в подпапке.
 */
export function getAnalyticsCsvFetchPath(publicUrl: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const path = publicUrl.startsWith("/") ? publicUrl : `/${publicUrl}`;
  const full = `${base}${path}`.replace(/([^:]\/)\/+/g, "$1");
  return full;
}

/** Origin приложения для server-side fetch static assets (Railway / Vercel). */
export function getAnalyticsServerOrigin(): string {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    return railway.startsWith("http") ? railway.replace(/\/$/, "") : `https://${railway}`;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel}`;
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, "");
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}
