import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClientAuthProvider } from "@/components/providers/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WatchThis - Collaborative Movie & TV Tracking",
  description: "Track and discover movies and TV shows with friends. Create lists, share recommendations, and never miss what to watch next.",
  keywords: ["movies", "tv shows", "tracking", "watchlist", "collaboration", "entertainment"],
  authors: [{ name: "Ben Paulsen", url: "https://benpaulsen.tech" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ef4444",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}
      >
        <ClientAuthProvider>
          {children}
        </ClientAuthProvider>
      </body>
      <Analytics />
      <SpeedInsights />
    </html>
  );
}
