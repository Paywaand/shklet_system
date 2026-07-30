import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Shklet brand palette. Token names are kept from the original theme so
        // every existing `bg-corn` / `text-cocoa` class keeps working:
        //   corn  = primary brand red
        //   leaf  = success green (used for profits / positive numbers)
        //   cream = brand cream background
        //   cocoa = ink (near-black text)
        corn: {
          DEFAULT: "#EC2231", // Shklet red
          50: "#FEE9EB",
          100: "#FDD3D7",
          400: "#F04B58",
          500: "#EC2231",
          600: "#C81423",
        },
        leaf: {
          DEFAULT: "#3E9B4F", // success green
          50: "#EAF6EC",
          100: "#D4EDD9",
          500: "#3E9B4F",
          600: "#338040",
        },
        cream: {
          DEFAULT: "#F2E8DC", // Shklet cream (mascot body)
          dark: "#E7DACA",
        },
        cocoa: {
          DEFAULT: "#1A1A1A", // ink
          light: "#3D3D3D",
        },
        blush: {
          DEFAULT: "#F4A0B5", // mascot cheek pink (accents)
        },
      },
      fontFamily: {
        sans: ["var(--font-sirwan)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
