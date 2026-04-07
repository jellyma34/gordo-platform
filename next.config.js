/** Публичный URL backend на Railway (без порта, HTTPS). */
const PRODUCTION_API_URL = "https://gordo-platform-production.up.railway.app";
/** Dev backend: `next dev` должен ходить сюда, а не в production. */
const DEVELOPMENT_API_URL = "https://gordo-platform-dev.up.railway.app";

/**
 * Railway публичный URL не должен содержать порт (:8000 и т.д.).
 * Иначе браузер не достучится до API, даже если переменная задана в UI Railway.
 */
function sanitizeNextPublicApiUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return;
  try {
    const u = new URL(trimmed);
    if (u.hostname.toLowerCase().endsWith(".railway.app") && u.port !== "") {
      u.port = "";
      process.env.NEXT_PUBLIC_API_URL = u.href.replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
}

/**
 * При `next dev` не использовать production API (частая ошибка — `.env.local` с prod URL).
 * Пустой URL, localhost или явный production → dev backend на Railway.
 * Локальный FastAPI: задайте `NEXT_PUBLIC_API_URL=http://127.0.0.1:8080` и `NEXT_PUBLIC_API_FORCE_LOCAL=1`.
 */
function enforceDevelopmentApiUrl() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_PUBLIC_API_FORCE_LOCAL === "1") return;

  const raw = process.env.NEXT_PUBLIC_API_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const useDev = () => {
    process.env.NEXT_PUBLIC_API_URL = DEVELOPMENT_API_URL;
  };

  if (!trimmed) {
    useDev();
    return;
  }
  try {
    const u = new URL(trimmed);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") {
      useDev();
      return;
    }
    const prodHost = new URL(PRODUCTION_API_URL).hostname.toLowerCase();
    if (h === prodHost || trimmed.includes("gordo-platform-production")) {
      useDev();
    }
  } catch {
    useDev();
  }
}

/**
 * При `next build` `.env.local` перекрывает `.env.production` и часто задаёт localhost.
 * Для production-сборки принудительно подставляем HTTPS Railway, если URL пустой или loopback.
 */
function enforceProductionApiUrl() {
  if (process.env.NODE_ENV !== "production") return;
  const raw = process.env.NEXT_PUBLIC_API_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    process.env.NEXT_PUBLIC_API_URL = PRODUCTION_API_URL;
    return;
  }
  try {
    const h = new URL(trimmed).hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") {
      process.env.NEXT_PUBLIC_API_URL = PRODUCTION_API_URL;
    }
  } catch {
    process.env.NEXT_PUBLIC_API_URL = PRODUCTION_API_URL;
  }
}

sanitizeNextPublicApiUrl();
enforceDevelopmentApiUrl();
enforceProductionApiUrl();

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
