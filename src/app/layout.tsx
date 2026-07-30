import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/i18n";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import { noFlashScript } from "@/lib/no-flash-script";

// Fallback typefaces until the real brand fonts (AMSI PRO, UniSIRWAN Ping)
// are sourced and licensed — see README "Fonts". Chosen to be geometric,
// modern, and high-contrast at small sizes so the interim look is still
// premium, not a generic system-ui default.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-amsi-fallback",
  display: "swap",
});

const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sirwan-fallback",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shklet POS",
  description: "Shklet Kiosk — Sales & Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${jakarta.variable} ${notoKufi.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-shklet-cream" suppressHydrationWarning>
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
