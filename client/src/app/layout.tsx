import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { OfflineSyncProvider } from "@/components/offline/offline-sync-provider";
import { ClientQueryProvider } from "@/components/providers/client-query-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "M&M SuperMart ERP",
  description: "White-label supermarket ERP for inventory, POS, employees, reports, and multi-branch operations.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/mm-logo-icon.png",
    apple: "/mm-logo-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ClientQueryProvider>
            <PwaRegister />
            <OfflineSyncProvider />
            {children}
          </ClientQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
