import type { Metadata, Viewport } from "next";
import { sirwan } from "@/lib/fonts";
import { ToastProvider } from "@/components/Toast";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shklet — POS & Management",
  description: "Sales & Management System for Shklet",
  // PWA: lets the site be installed and launched in standalone mode.
  manifest: "/manifest.json",
  applicationName: "Shklet POS",
  appleWebApp: {
    capable: true,
    title: "Shklet POS",
    statusBarStyle: "default",
  },
  // Android Chrome's generic standalone hint (Next doesn't emit this on its own).
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  // Scaled down so the UI is compact on the 11" tablet. userScalable:false +
  // maximumScale:1 disable pinch/double-tap zoom so a double-tap on a product
  // card registers as two taps (add 2), never a zoom gesture.
  initialScale: 0.75,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#EC2231",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sirwan.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        {/* Apply saved theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.theme==='dark'||(!('theme'in localStorage)&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
