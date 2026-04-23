import type { Metadata } from "next";
import Tabs from "@/components/Tabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "地域密着レーダー",
  description: "1都3県の地域密着メディアから新規開店情報を横断収集",
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
            <span className="sub">1都3県 新規開店情報ダッシュボード</span>
          </h1>
          <div className="meta">自動取込: 1時間ごと</div>
        </header>
        <Tabs />
        {children}
      </body>
    </html>
  );
}
