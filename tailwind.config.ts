import type { Config } from "tailwindcss";

// Palette: warm film paper, ink black, teal (main buttons and links), mustard (call-to-action), tomato (accents).
// Shadows are hard-edged "sticker" shadows.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { paper: "#f5efe4", ink: "#16120e", cobalt: "#0d7a6b", sodium: "#ffc83d", tomato: "#ef4b2b", mint: "#bfe8d6" },
      fontFamily: { display: ["var(--font-display)", "Georgia", "serif"], sans: ["var(--font-body)", "sans-serif"] },
      boxShadow: {
        sm: "2px 2px 0 0 #16120e", DEFAULT: "3px 3px 0 0 #16120e", md: "4px 4px 0 0 #16120e",
        lg: "5px 5px 0 0 #16120e", xl: "6px 6px 0 0 #16120e", "2xl": "8px 8px 0 0 #16120e",
      },
    },
  },
  plugins: [],
} satisfies Config;