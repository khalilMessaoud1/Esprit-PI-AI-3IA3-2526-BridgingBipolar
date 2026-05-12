import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#6B9BD4",
        secondary: "#9BBCE8",
        background: "#F4F7FB",
        card: "#FFFFFF",
        textPrimary: "#2E3A59",
        textSecondary: "#64748B",
        mania: "#E8B87A",
        depression: "#94A8B8",
        stable: "#7EC8B3",
        medical: {
          blue: "#E8F4FC",
          teal: "#D6F0EE",
          lavender: "#EDE9FE",
          mist: "#F1F5F9",
          ink: "#334155"
        },
        phase: {
          euthymic: "#7EC8B3",
          depressive: "#94A8B8",
          hypomanic: "#E8B87A",
          manic: "#E59866",
          mixed: "#B794F4",
          undetermined: "#94A3B8"
        }
      },
      borderRadius: {
        xl: "16px",
        "2xl": "1.25rem"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(46, 58, 89, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
