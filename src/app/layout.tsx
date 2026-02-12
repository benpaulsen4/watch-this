import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { getMetadataBase } from "@/lib/seo/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "WatchThis - Collaborative Movie & TV Tracking",
  description:
    "Track and discover movies and TV shows with friends. Create lists, share recommendations, and never miss what to watch next.",
  applicationName: "WatchThis",
  keywords: [
    "movies",
    "tv shows",
    "tracking",
    "watchlist",
    "collaboration",
    "entertainment",
  ],
  authors: [{ name: "Ben Paulsen", url: "https://benpaulsen.tech" }],
  openGraph: {
    title: "WatchThis - Collaborative Movie & TV Tracking",
    description:
      "Track and discover movies and TV shows with friends. Create lists, share recommendations, and never miss what to watch next.",
    siteName: "WatchThis",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WatchThis - Collaborative Movie & TV Tracking",
    description:
      "Track and discover movies and TV shows with friends. Create lists, share recommendations, and never miss what to watch next.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}
      >
        <ReactQueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </ReactQueryProvider>
      </body>
      <Analytics />
      <SpeedInsights />
    </html>
  );
}
