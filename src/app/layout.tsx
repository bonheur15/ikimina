import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
export const metadata: Metadata = { title: "Elayo Family — Your savings, connected", description: "Your contributions, savings and statements. A personal space for every member of Caisse d’entraide Elayo Family.", icons: { icon: "/images/elayo/favicon.png" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-scroll-behavior="smooth"><body className={poppins.variable}>{children}</body></html>; }
