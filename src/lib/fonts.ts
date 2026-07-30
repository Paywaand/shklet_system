import localFont from "next/font/local";

// UniSIRWAN Ping — the brand font (supports Latin + Arabic/Kurdish for future use).
export const sirwan = localFont({
  src: [
    { path: "../../public/brand/UniSIRWAN Ping Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/brand/UniSIRWAN Ping Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/brand/UniSIRWAN Ping Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/brand/UniSIRWAN Ping Heavy.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-sirwan",
  display: "swap",
});
