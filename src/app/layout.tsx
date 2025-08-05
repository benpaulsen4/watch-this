import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  authors: [{ name: "WatchThis Team" }],
  // TODO use new viewport declaration
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#ef4444",
};

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
        {children}
      </body>
    </html>
  );
}
