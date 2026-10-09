import type { Metadata } from "next";
import Link from "next/link";
import Tabs from "@/components/Tabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "地域密着レーダー",
  description: "1都3県と愛知・大阪・京都の地域密着メディアから新規開店情報を横断収集",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <header className="app-header">
          <h1>
            地域密着レーダー
            <span className="sub">1都3県＋愛知・大阪・京都 新規開店情報ダッシュボード</span>
          </h1>
          <div className="meta">
            自動取込: 1時間ごと
            <Link href="/sources" className="meta-link">
              情報源の状況
            </Link>
          </div>
        </header>
        <Tabs />
        {children}
      </body>
    </html>
  );
}
