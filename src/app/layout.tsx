import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = { title: "PHYTO Commercial Intelligence", description: "Sales, sell-out and AI-powered business intelligence", icons: { icon: "/icon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7F7F2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
