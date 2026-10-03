import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ShareSpace — Build together', template: '%s · ShareSpace' },
  description: 'A shared workspace for builders and their coding agents. See the work, compare intent, and coordinate with context.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
