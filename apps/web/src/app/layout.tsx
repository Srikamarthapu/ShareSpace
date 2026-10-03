import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { themeInitializationScript } from "@/components/theme-preference";

export const metadata: Metadata = {
  title: { default: "ShareSpace — Build together", template: "%s · ShareSpace" },
  description:
    "A shared workspace for builders and their coding agents. See the work, compare intent, and coordinate with context.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
