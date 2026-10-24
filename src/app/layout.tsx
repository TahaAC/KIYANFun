import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KIYAN - Voice Math Adventure",
  description: "A fun voice-powered math app for Kiyan. Speak math, see results, hear the answer, and rack up points!",
  keywords: ["KIYAN", "kids math", "voice math", "speech recognition", "learning game"],
  authors: [{ name: "Made for Kiyan" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "KIYAN - Voice Math Adventure",
    description: "Speak math, see results, hear the answer — fun for kids!",
    siteName: "KIYAN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KIYAN - Voice Math Adventure",
    description: "Speak math, see results, hear the answer — fun for kids!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
