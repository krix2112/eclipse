import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Eclipse | Your movie taste, mapped.",
  description:
    "Explore how your favorite films connect through genres, directors, cast, and eras in an interactive visual map.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-[#0F0F12] text-[#F2F2F3] antialiased flex flex-col font-sans selection:bg-[#FF5A4F]/25 selection:text-white">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
