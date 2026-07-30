import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Shklet brand palette (no green). Token names are kept from the
        // original theme so every existing `bg-corn` / `text-cocoa` class
        // keeps working:
        //   corn     = primary brand red
        //   leaf     = accent / positive numbers — brown, NOT green
        //   cream    = brand cream background
        //   cocoa    = ink (near-black text)
        //   lavender = secondary accent
        //   gold     = tertiary accent / highlight
        corn: {
          DEFAULT: "#EF3340", // Pantone Red 032 C
          50: "#FDEAEB",
          100: "#FBD1D4",
          400: "#F15C67",
          500: "#EF3340",
          600: "#CC1D29",
        },
        leaf: {
          DEFAULT: "#AA8066", // Pantone 479 C (brown) — replaces old green
          50: "#F3EDE9",
          100: "#E5D8CF",
          500: "#AA8066",
          600: "#8C6852",
        },
        cream: {
          DEFAULT: "#F5EFE8", // Pastel Bright Winter Cloud
          dark: "#E9DFD2",
        },
        cocoa: {
          DEFAULT: "#232222", // Neutral Black C
          light: "#454343",
        },
        lavender: {
          DEFAULT: "#CBA3D8", // Pantone 2563 C
          50: "#F3E9F6",
          500: "#CBA3D8",
          600: "#AD7EBD",
        },
        gold: {
          DEFAULT: "#FEDB00", // Pantone 108 C
          50: "#FFF9DB",
          500: "#FEDB00",
          600: "#D9BB00",
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
