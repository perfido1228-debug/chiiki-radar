"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "一覧（1都3県）" },
  { href: "/tokyo", label: "東京都" },
  { href: "/kanagawa", label: "神奈川県" },
  { href: "/chiba", label: "千葉県" },
  { href: "/saitama", label: "埼玉県" },
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
