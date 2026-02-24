import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "Sevaro Ambulatory - AI-Powered Outpatient Neurology",
  description: "Reimagining every step of outpatient neurology with AI — from referral triage to continuous monitoring.",
};

// Inline script that runs before first paint to apply saved font-size preference.
// This prevents a flash of default font size when the user has previously saved a preference.
const fontSizeInitScript = `
(function() {
  try {
    var s = localStorage.getItem('sevaro-user-settings');
    if (s) {
      var p = JSON.parse(s);
      var fs = p.fontSize;
      var val = fs === 'small' ? '13px' : fs === 'large' ? '16px' : '14px';
      document.documentElement.style.setProperty('--base-font-size', val);
      document.documentElement.setAttribute('data-font-size', fs || 'medium');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <script dangerouslySetInnerHTML={{ __html: fontSizeInitScript }} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
