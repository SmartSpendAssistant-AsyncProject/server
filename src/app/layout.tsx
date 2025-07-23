import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Spend Assistant REST API',
  description: 'Created by The Async Project'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
