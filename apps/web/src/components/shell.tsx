'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, BookOpen, ChevronRight, Code2, FlaskConical, GitBranch, Layers2, LayoutGrid, MessageSquareText, PanelLeftClose, Plug, Settings2, ShieldCheck, Workflow } from 'lucide-react';
import { useWorkspace } from './workspace-provider';

const navigation = [
  { href: '/', label: 'Workspace', icon: LayoutGrid },
  { href: '/sessions', label: 'Sessions', icon: MessageSquareText },
  { href: '/coordination', label: 'Coordination', icon: Workflow },
  { href: '/connect', label: 'Connections', icon: Plug },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, notice } = useWorkspace();
  const current = navigation.find(item => item.href === '/' ? pathname === '/' : pathname.startsWith(item.href));
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="brand" aria-label="ShareSpace home"><span className="brand-mark"><Layers2 size={22} strokeWidth={1.8} aria-hidden="true" /></span>ShareSpace<span className="version">α</span></Link>
      <div className="project-switcher"><span className="project-icon"><Code2 size={20} aria-hidden="true" /></span><div><strong>College Compass</strong><span>Sample project</span></div><PanelLeftClose size={15} className="muted desktop-only" aria-hidden="true" /></div>
      <span className="nav-caption">PROJECT</span>
      <nav aria-label="Main navigation" className="main-navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={current?.href === href ? 'page' : undefined} className={current?.href === href ? 'nav-item selected' : 'nav-item'}><Icon size={18} aria-hidden="true" /><span>{label}</span>{href === '/coordination' && !state.resolution && <span className="nav-count">1</span>}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={18} aria-hidden="true" /><p>Your agent. Your workflow.<br /><span>Shared context, on your terms.</span></p></div>
        <Link href="/guide" className={`nav-item ${pathname === '/guide' ? 'selected' : ''}`} aria-current={pathname === '/guide' ? 'page' : undefined}><BookOpen size={18} aria-hidden="true" />Build guide<ArrowUpRight size={14} className="end-icon" aria-hidden="true" /></Link>
        <div className="profile"><span className="avatar avatar-sri avatar-small">SK</span><div><strong>Sri’s workspace</strong><span>Starter · v0.1</span></div></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>College Compass</span><ChevronRight size={13} aria-hidden="true" /><strong>{current?.label ?? 'Build guide'}</strong></div><span className="repository"><GitBranch size={14} aria-hidden="true" />college-compass</span></header>
      <div className="sample-banner"><span><FlaskConical size={15} aria-hidden="true" /><strong>Sample workspace</strong><span className="sample-explainer">Explore the flow. Changes stay in this browser.</span></span><Link href="/login">Set up a real workspace <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <div className={notice ? 'save-notice' : 'sr-only'} role="status" aria-live="polite">{notice}</div>
      <footer className="app-footer"><span>ShareSpace / A little context goes a long way.</span><span>Sample data · No agents connected</span></footer>
    </div>
  </div>;
}
