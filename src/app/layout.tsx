import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sevaro Clinical - AI-Powered Clinical Documentation",
  description: "Streamline your clinical documentation with AI-powered tools for neurology practices",
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
        {children}
      </body>
    </html>
  );
}
