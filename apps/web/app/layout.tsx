import type { Metadata, Viewport } from 'next';
import { Archivo, VT323 } from 'next/font/google';
import './globals.css';

const vt323 = VT323({ subsets: ['latin'], weight: '400', variable: '--font-vt323', display: 'swap' });
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: 'Second Order · Alpha Crash Test Utility',
  description: 'A profitable wallet is not necessarily profitable to copy. Second Order stress-tests a source trade against delay, size and competing flow.',
};
export const viewport: Viewport = { themeColor: '#007f7f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${vt323.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
