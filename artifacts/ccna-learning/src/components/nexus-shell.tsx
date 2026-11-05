import { useI18n } from '../i18n';
import { LanguageSelect } from '../i18n';
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Network,
  LayoutDashboard,
  Target,
  History,
  BookOpen,
  ShieldCheck,
  Menu,
  ChevronLeft,
  Radio,
  UserRound,
  FileQuestion,
  Layers3,
  Upload,
  ClipboardCheck,
} from "lucide-react";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import { useNexusIdentity } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { AccountMenu } from "./application-navigation";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { adminModules } from './admin-ui';
import "../nexus.css";
const links = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/topics", label: "Learning Curriculum", icon: BookOpen },
  { href: "/practice", label: "Challenge Arena", icon: Target },
  { href: "/practice/history", label: "Learning Intelligence", icon: History },
  { href: "/profile", label: "Learner Profile", icon: UserRound },
  { href: "/exam", label: "Exam Simulator", icon: ClipboardCheck },
];
const adminIcons: Record<string, typeof ShieldCheck> = {
  '/admin': ShieldCheck, '/admin/topics': Layers3, '/admin/questions': FileQuestion,
  '/admin/taxonomy': BookOpen, '/admin/import': Upload, '/admin/lessons': BookOpen,
};
export function isNavigationCurrent(path: string, href: string) {
  const current = path.split(/[?#]/)[0];
  // The root, practice and Admin overview links must not also highlight a
  // more-specific destination such as practice history or a content module.
  return current === href || (href === '/topics' && current.startsWith('/learn/')) || (!['/', '/practice', '/admin'].includes(href) && current.startsWith(href + '/'));
}
function NexusSidebar({
  compact = false,
  onNavigate,
  basePath = '',
}: {
  compact?: boolean;
  onNavigate?: () => void;
  basePath?: string;
}) {
  const { t: translateUi, message } = useI18n();
  const [path] = useLocation(),
    identity = useNexusIdentity(),
    user = useGetCurrentUser({
      query: {
        queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
        enabled: !!identity,
        retry: false,
        gcTime: 0,
      },
    });
  return (
    <>
      <Link href="/" className="nexus-brand" onClick={onNavigate}>
        <Network size={30} />
        <span dir="ltr">
          CCNA <strong>NEXUS</strong>
          <small dir="auto">{translateUi("NETWORK LEARNING SYSTEM")}</small>
        </span>
      </Link>
      <small className="nexus-nav-caption">{translateUi("YOUR LEARNING NETWORK")}</small>
      <nav aria-label={translateUi("Learner navigation")}>
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={isNavigationCurrent(path,href) ? "is-current" : ""}
            aria-current={isNavigationCurrent(path,href) ? "page" : undefined}
            aria-label={message(label)}
            title={compact ? message(label) : undefined}
            onClick={onNavigate}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{message(label)}</span>
          </Link>
        ))}
      </nav>
      {!!identity && !user.isError && !user.isPending && user.data?.user.role === 'ADMIN' && (
        <>
          <small className="nexus-nav-caption nexus-admin-caption">{translateUi("ADMINISTRATION")}</small>
          <nav aria-label={translateUi("Administration navigation")}>
            {adminModules.map((module) => {
              const Icon=adminIcons[module.href] ?? ShieldCheck;
              return <Link key={module.href} href={module.href}
                aria-label={message(module.href==='/admin'?'Administration':module.title)}
                title={compact?message(module.title):undefined}
                className={isNavigationCurrent(path,module.href)?'is-current':''}
                aria-current={isNavigationCurrent(path,module.href)?'page':undefined} onClick={onNavigate}>
                <Icon size={19} aria-hidden="true"/><span>{message(module.href==='/admin'?'Administration':module.title)}</span>
              </Link>;
            })}
          </nav>
        </>
      )}
      <div className="nexus-sidebar-foot">
        <div className="nexus-network-label">
          <Radio size={16} />
          <span>{translateUi("Build skills. Connect ideas.")}</span>
        </div>
        <AccountMenu basePath={basePath} />
      </div>
    </>
  );
}
export function NexusAppShell({ children, basePath = '' }: { children?: ReactNode; basePath?: string }) {
  const { t: translateUi, dir } = useI18n();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    health = useHealthCheck({ query: { queryKey: ["/api/healthz"], retry: false } });
  return (
    <Sheet open={mobile} onOpenChange={setMobile}>
    <div className={"nexus-app" + (collapsed ? " nexus-compact" : "")}>
      <a href="#nexus-content" className="nexus-skip">
        {translateUi("Skip to learning content")}</a>
      <aside className="nexus-sidebar" aria-label={translateUi("Primary navigation")}>
        <div className="nexus-sidebar-scroll"><NexusSidebar compact={collapsed} basePath={basePath} /></div>
        <button
          type="button"
          className="nexus-collapse"
          aria-label={collapsed ? translateUi("Expand sidebar") : translateUi("Collapse sidebar")}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
      <div className="nexus-body">
        <header className="nexus-topbar">
          <SheetTrigger asChild><button
            type="button"
            className="nexus-mobile-menu"
            aria-label={translateUi("Open learning navigation")}
          >
            <Menu size={20} />
          </button></SheetTrigger>
          <span>
            CCNA 200-301 <strong>{translateUi("LEARNING WORKSPACE")}</strong>
          </span>
          <LanguageSelect />
          <span className="nexus-status">
            <i className={health.isSuccess ? "available" : "unavailable"} />
            {health.isSuccess
              ? translateUi("API connected")
              : health.isPending
                ? translateUi("Checking API")
                : translateUi("API unavailable")}
          </span>
        </header>
        <main id="nexus-content" tabIndex={-1}>
          {children}
        </main>
      </div>
        <SheetContent side={dir==='rtl'?'right':'left'} className="nexus-mobile-sidebar">
          <SheetTitle className="sr-only">{translateUi("Learning navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{translateUi("Choose a learning workspace.")}</SheetDescription>
          <NexusSidebar basePath={basePath} onNavigate={() => setMobile(false)} />
        </SheetContent>
    </div>
    </Sheet>
  );
}
