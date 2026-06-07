import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--app-font-family)", "system-ui", "sans-serif"],
      },
      colors: {
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        background: "var(--color-background)",
        card: "var(--color-card)",
        textPrimary: "var(--color-text-primary)",
        textSecondary: "var(--color-text-secondary)",
        mania: "var(--color-phase-manic)",
        depression: "var(--color-phase-depressive)",
        stable: "var(--color-phase-euthymic)",
        medical: {
          blue: "#E8F4FC",
          teal: "#D6F0EE",
          lavender: "#EDE9FE",
          mist: "#F1F5F9",
          ink: "#334155",
        },
        phase: {
          euthymic: "var(--color-phase-euthymic)",
          depressive: "var(--color-phase-depressive)",
          hypomanic: "var(--color-phase-hypomanic)",
          manic: "var(--color-phase-manic)",
          mixed: "var(--color-phase-mixed)",
          undetermined: "var(--color-phase-undetermined)",
        },
      },
      borderRadius: {
        xl: "16px",
        "2xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(46, 58, 89, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
