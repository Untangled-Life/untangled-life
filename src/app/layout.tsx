import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Untangled Life | Two calendars. One life. No knots.";
const DESCRIPTION =
  "Untangled Life pulls both your calendars into one view, spots the evenings you're actually both free, and gets the date booked before the week swallows it.";

/**
 * Link previews (WhatsApp, iMessage, Slack, LinkedIn) read the Open Graph
 * tags. The image itself is the file convention: `opengraph-image.png` beside
 * this file becomes `og:image` and `twitter:image` automatically, and
 * `metadataBase` is what turns that into the absolute URL the scrapers need.
 * `favicon.ico`, `icon.png` and `apple-icon.png` are picked up the same way.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://www.untangledlife.com.au"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Untangled Life",
    locale: "en_AU",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-surface text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
