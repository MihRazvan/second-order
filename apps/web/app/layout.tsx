import type { Metadata, Viewport } from 'next';
import { Archivo, Martian_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap', axes: ['wdth'] });
const martian = Martian_Mono({ subsets: ['latin'], variable: '--font-martian', display: 'swap', weight: ['300', '400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Second Order · Alpha Crash Test',
  description: 'A profitable wallet is not necessarily profitable to copy. Second Order stress-tests a source trade against delay, size and competing flow.',
};
export const viewport: Viewport = { themeColor: '#1a1b1f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable}`}>
      <body>{children}</body>
    </html>
  );
}
