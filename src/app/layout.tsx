import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Racoon Eye',
  description:
    'Discover hospitals, manage your health biodata securely, and access first-aid guidance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
