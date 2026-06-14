/** Публичный URL backend на Railway (без порта, HTTPS). */



/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * recharts — только через `@/components/charting/rechartsClient` (barrel).
   * Не включать "recharts" сюда: optimizePackageImports + barrel re-export дают
   * два графа модулей → undefined factory → «reading 'call'» на всех секциях construction.
   * react-chartjs-2 — только через `@/components/charting/reactChartjsChart`.
   */
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
