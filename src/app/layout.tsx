// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"; // If using Vercel Analytics

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "X Alignment Chart AI",
  description:
    "Discover your D&D alignment based on your X (Twitter) profile using AI.",
  // Add more metadata: openGraph, icons etc.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {" "}
      {/* Default to dark or remove for system preference */}
      <body
        className={`${inter.className} bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 antialiased`}
      >
        {children}
        <Analytics /> {/* If using Vercel Analytics */}
      </body>
    </html>
  );
}
