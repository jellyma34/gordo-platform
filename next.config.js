/** Публичный URL backend на Railway (без порта, HTTPS). */



/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  /** Статические импорты из recharts/… обрабатываются предсказуемее, меньше «битых» чанков в dev. */
  experimental: {
    optimizePackageImports: ["recharts", "react-chartjs-2", "lucide-react"],
  },
};

module.exports = nextConfig;
