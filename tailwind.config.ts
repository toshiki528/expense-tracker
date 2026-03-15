import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-card": "var(--bg-card)",
        ink: "var(--ink)",
        "ink-light": "var(--ink-light)",
        accent: "var(--accent)",
        "accent-light": "var(--accent-light)",
        "accent-muted": "var(--accent-muted)",
        "accent-dark": "var(--accent-dark)",
        "warm-gray": {
          50: "var(--warm-gray-50)",
          100: "var(--warm-gray-100)",
          200: "var(--warm-gray-200)",
          300: "var(--warm-gray-300)",
          400: "var(--warm-gray-400)",
          500: "var(--warm-gray-500)",
          600: "var(--warm-gray-600)",
        },
        "wborder": "var(--border)",
        "wborder-strong": "var(--border-strong)",
        error: "var(--error)",
        "error-light": "var(--error-light)",
        cream: "var(--cream)",
        "cream-accent": "var(--cream-accent)",
        warning: "var(--warning)",
      },
      fontFamily: {
        body: ['"Zen Kaku Gothic New"', 'sans-serif'],
        amount: ['"JetBrains Mono"', 'monospace'],
      },
      borderColor: {
        DEFAULT: "var(--border)",
        strong: "var(--border-strong)",
      },
    },
  },
  plugins: [],
};
export default config;
