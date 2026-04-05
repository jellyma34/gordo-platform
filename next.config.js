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

sanitizeNextPublicApiUrl();

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
