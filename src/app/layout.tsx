import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sevaro Clinical - AI-Powered Clinical Documentation",
  description: "Streamline your clinical documentation with AI-powered tools for neurology practices",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
