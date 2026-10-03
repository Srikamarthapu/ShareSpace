"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  GitBranch,
  LayoutGrid,
  MessageSquareText,
  Plug,
  Settings2,
  Bell,
  Database,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { useWorkspaceControls } from "@/features/workspace-controls/store";
import { ThemeToggle } from "./theme-toggle";

const navigation = [
  { href: "/", label: "Workspace", icon: LayoutGrid },
  { href: "/sessions", label: "Sessions", icon: MessageSquareText },
  { href: "/warnings", label: "Warnings", icon: Bell },
  { href: "/connect", label: "Connections", icon: Plug },
  { href: "/storage", label: "Storage", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { notice } = useWorkspace();
  const { state: controls, actor } = useWorkspaceControls();
  const current = navigation.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link href="/" className="brand" aria-label="ShareSpace home">
          ShareSpace<span className="version">alpha</span>
        </Link>
        <div className="nav-caption">PROJECT</div>
        <nav aria-label="Main navigation" className="main-navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={current?.href === href ? "page" : undefined}
              className={`nav-item ${current?.href === href ? "selected" : ""}`}
            >
              <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/guide"
            className={`nav-item ${pathname === "/guide" ? "selected" : ""}`}
            aria-current={pathname === "/guide" ? "page" : undefined}
          >
            <BookOpen size={17} strokeWidth={1.6} aria-hidden="true" />
            Workspace guide
            <ArrowUpRight size={13} className="end-icon" aria-hidden="true" />
          </Link>
          <div className="profile">
            <span className="avatar avatar-sri avatar-small" aria-hidden="true">
              {actor?.name.slice(0, 2).toUpperCase() ?? "SS"}
            </span>
            <div>
              <strong>{actor?.name ?? "Sample"}’s workspace</strong>
              <span>Sample {actor?.role ?? "account"}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <strong>{controls.teamName}</strong>
            <ChevronRight size={14} aria-hidden="true" />
            <span>
              {current?.label ?? (pathname === "/guide" ? "Workspace guide" : "Workspace")}
            </span>
          </div>
          <div className="workspace-mode">
            <ThemeToggle />
            <span className="sample-indicator">Sample workspace</span>
            <Link href="/login">
              Sign in
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <div className={notice ? "save-notice" : "sr-only"} role="status" aria-live="polite">
          {notice}
        </div>
        <footer className="app-footer">
          <span>
            <GitBranch size={13} aria-hidden="true" />
            {controls.repositoryName}
          </span>
          <span>Synthetic history · No agents connected</span>
        </footer>
      </div>
    </div>
  );
}
