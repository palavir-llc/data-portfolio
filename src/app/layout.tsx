import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://portfolio.palavir.co"),
  title: "Data Stories | Josh Elberg",
  description:
    "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
  openGraph: {
    title: "Data Stories | Josh Elberg",
    description:
      "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Data Stories | Josh Elberg",
    description:
      "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-zinc-950 text-zinc-100`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Data Stories",
              url: "https://portfolio.palavir.co",
              author: {
                "@type": "Person",
                name: "Josh Elberg",
                url: "https://palavir.co",
              },
              description:
                "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
            }),
          }}
        />
        {children}
        <Script strategy="afterInteractive" src="https://www.googletagmanager.com/gtag/js?id=G-8XHCZCKB9Z" />
        <Script id="ga-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-8XHCZCKB9Z')" }} />
      </body>
    </html>
  );
}
