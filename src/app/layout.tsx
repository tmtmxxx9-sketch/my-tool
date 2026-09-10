import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ストックノート",
  description: "家族向け在庫管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
