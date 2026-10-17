import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { paper: "#eef0f6", ink: "#11172b", cobalt: "#2f4bff", sodium: "#ffd23f" },
      fontFamily: { display: ["var(--font-display)", "sans-serif"], sans: ["var(--font-body)", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
