// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react"; // If using Vercel Analytics
import { Providers } from "./providers"; // <--- IMPORT YOUR NEW PROVIDER

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "X Alignment Chart AI",
  description:
    "Discover your D&D alignment based on your X (Twitter) profile using AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 antialiased`}
      >
        <Providers>
          {" "}
          {/* <--- WRAP CHILDREN WITH PROVIDERS */}
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
