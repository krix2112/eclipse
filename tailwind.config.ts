import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        charcoal: {
          bg: "#0F0F12",
          surface: "#17171C",
          border: "#26262D",
          hover: "#1F1F26",
          active: "#25252E",
          card: "#17171C",
        },
        text: {
          primary: "#F2F2F3",
          muted: "#8B8B95",
        },
        coral: {
          DEFAULT: "#FF5A4F",
          hover: "#E84E44",
          light: "rgba(255, 90, 79, 0.12)",
          border: "rgba(255, 90, 79, 0.35)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)",
        card: "0 4px 16px -2px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
