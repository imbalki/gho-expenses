import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GHO Expenses',
  description: 'Multi-channel expense and project tracker for GHO Paints',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#2f6f5e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
