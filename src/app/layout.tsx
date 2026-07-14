import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ekoa — Répondez. Comparez. Comprenez.",
  description: "Une future plateforme pour comprendre les opinions de la communauté Ekoa.",
  applicationName: "Ekoa",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
