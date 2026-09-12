import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Untangled Life — Two calendars. One life. No knots.",
  description:
    "Untangled Life pulls both your calendars into one view, spots the evenings you're actually both free, and gets the date booked before the week swallows it.",
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
