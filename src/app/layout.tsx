import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/pwa";
import { PageLoadingDelay } from "@/components/page-loading-delay";
import "./globals.css";
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
export const metadata: Metadata = {
  title: "Elayo Family — Your savings, connected",
  description: "Your contributions, savings and statements. A personal space for every member of Caisse d’entraide Elayo Family.",
  applicationName: "Elayo Family",
  appleWebApp: { capable: true, title: "Elayo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" } },
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-scroll-behavior="smooth"><body className={poppins.variable}><PageLoadingDelay>{children}</PageLoadingDelay><ServiceWorkerRegistration /></body></html>; }
