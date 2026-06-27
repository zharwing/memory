import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
  Boxes,
  Cable,
  FileText,
  GitFork,
  Home,
  Search,
  Settings,
  Upload,
  Trash2,
  Wrench
} from "lucide-react";
import { useStore } from "../stores/store-context.js";

const primaryNav = [
  { label: "Dashboard", href: "/dashboard", icon: Home, matches: ["/dashboard"] },
  { label: "Repos", href: "/repositories", icon: GitFork, matches: ["/repositories"] },
  { label: "Work", href: "/current-work", icon: Cable, matches: ["/current-work", "/sessions", "/workstreams"] },
  { label: "Library", href: "/docs", icon: FileText, matches: ["/docs", "/diagrams", "/graph", "/inbox", "/context"] },
  { label: "Import", href: "/import", icon: Upload, matches: ["/import"] },
  { label: "Search", href: "/search", icon: Search, matches: ["/search"] }
] as const;

const utilityNav = [
  { label: "Setup", href: "/setup", icon: Wrench, matches: ["/setup"] },
  { label: "Trash", href: "/trash", icon: Trash2, matches: ["/trash"] },
  { label: "Settings", href: "/settings", icon: Settings, matches: ["/settings", "/assistant", "/backups"] }
] as const;

export const Shell = observer(function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const project = store.selectedProject;
  const location = useLocation();
  const pendingInboxCount = store.inbox.filter((item) => item.status === "pending").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/dashboard">
          <Boxes size={22} />
          <span>AI Memory</span>
        </Link>
        <Link className="project-switcher" to="/projects">
          <span>Project</span>
          <strong>{project?.name || "Select project"}</strong>
          <small>Switch, create, delete</small>
        </Link>
        <nav className="sidebar-nav">
          <div className="nav-section">
            {primaryNav.map(({ label, href, icon: Icon, matches }) => (
              <Link key={href} to={href} className={`nav-item ${isActive(location.pathname, matches) ? "active" : ""}`}>
                <Icon size={17} />
                <span>{label}</span>
                {label === "Library" && pendingInboxCount > 0 ? <small>{pendingInboxCount}</small> : null}
              </Link>
            ))}
          </div>
          <div className="nav-section utility">
            {utilityNav.map(({ label, href, icon: Icon, matches }) => (
              <Link key={href} to={href} className={`nav-item ${isActive(location.pathname, matches) ? "active" : ""}`}>
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Project</p>
            <h1>{project?.name || "No project selected"}</h1>
          </div>
          <div className="topbar-meta">
            <span><GitFork size={15} /> {project?.repos?.length || 0} repos linked</span>
            <span>{store.loading ? "Updating" : "Ready"}</span>
          </div>
        </header>
        {store.error ? <div className="notice danger">{store.error}</div> : null}
        {children}
      </main>
    </div>
  );
});

function isActive(pathname: string, matches: readonly string[]): boolean {
  return matches.some((match) => pathname === match || pathname.startsWith(`${match}/`));
}
