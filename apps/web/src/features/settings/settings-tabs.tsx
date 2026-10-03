"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings", label: "General" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/storage", label: "Storage" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="settings-tabs" aria-label="Settings sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
