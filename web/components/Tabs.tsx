"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "一覧（全エリア）" },
  { href: "/tokyo", label: "東京都" },
  { href: "/kanagawa", label: "神奈川県" },
  { href: "/chiba", label: "千葉県" },
  { href: "/saitama", label: "埼玉県" },
  { href: "/aichi", label: "愛知県" },
  { href: "/osaka", label: "大阪府" },
  { href: "/kyoto", label: "京都府" },
];

export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={pathname === t.href ? "active" : ""}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
