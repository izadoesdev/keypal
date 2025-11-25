import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/lib/providers";
import "./globals.css";

const manrope = Manrope({
	variable: "--font-manrope",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Keypal Example App",
	description:
		"A comprehensive example application demonstrating keypal - a TypeScript library for secure API key management",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${manrope.variable} antialiased`}>
				<Providers>
					{children}
					<Toaster position="bottom-right" />
				</Providers>
			</body>
		</html>
	);
}
