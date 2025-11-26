import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Manrope } from 'next/font/google';
import type { Metadata } from 'next';

const manrope = Manrope({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'keypal - Secure API Key Management',
  description: 'Secure API key management for TypeScript with cryptographic hashing, expiration, scopes, and pluggable storage adapters.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={manrope.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
