/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        mpl: {
          page: "var(--mpl-page-bg)",
          card: "var(--mpl-card-bg)",
          border: "var(--mpl-border)",
          text: "var(--mpl-text)",
          muted: "var(--mpl-text-muted)",
          primary: "var(--mpl-primary)",
          "primary-blue": "var(--mpl-primary-blue)",
          chart: "var(--mpl-chart-surface)"
        }
      }
    }
  },
  plugins: []
};
