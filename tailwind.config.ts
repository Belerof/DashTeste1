import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F7F2", ink: "#292D27", muted: "#777B70",
        leaf: "#687A58", forest: "#354A39", sage: "#AAB49C",
        beige: "#E9E4D9", cream: "#F2EFE6", gold: "#B5A17B", line: "#E5E6DD",
        ok: "#708D70", warn: "#C49B5D", bad: "#B96C63",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: { soft: "0 1px 2px rgba(41,45,39,.04), 0 4px 16px rgba(41,45,39,.04)" },
    },
  },
  plugins: [],
} satisfies Config;
