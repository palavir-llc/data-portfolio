import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
  title: "Data Stories | Josh Elberg",
  description:
    "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
  openGraph: {
    title: "Data Stories | Josh Elberg",
    description:
      "Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.",
    type: "website",
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
      </body>
    </html>
  );
}
