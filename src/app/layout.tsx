import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AccountProvider } from "@/components/account-dashboard";
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
export const metadata: Metadata = { title: "Ikimina — Your savings, connected", description: "Your contributions, savings and statements. A personal space for every member of your savings group.", icons: { icon: "/icon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-scroll-behavior="smooth"><body className={poppins.variable}><AccountProvider>{children}</AccountProvider></body></html>; }
