import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
  Activity,
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
import { appPathFromPathname, projectPath } from "../utils/routes.js";
import { pendingInboxReviewCount } from "../utils/inbox.js";
import { semanticRunStatus } from "../features/semantic-review/index.js";

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
  const appPath = appPathFromPathname(location.pathname);
  const selectedProjectId = project?.id || store.selectedProjectId;
  const pendingInboxCount = pendingInboxReviewCount(store.inbox);
  const linkedRepoCount = store.repoLinks.length || project?.repos?.length || 0;
  const semanticRun = store.semanticAnalysisProgressRun || store.semanticGraphStatus?.runCounts?.latest;
  const { running: semanticRunRunning, progressLabel: semanticRunProgress } = semanticRunStatus(semanticRun, store.semanticAnalysisRunning);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to={projectPath(selectedProjectId, "/dashboard")}>
          <Boxes size={22} />
          <span>Zharwing Memory</span>
        </Link>
        <Link className="project-switcher" to="/projects">
          <span>Project</span>
          <strong>{project?.name || "Select project"}</strong>
          <small>Switch, create, delete</small>
        </Link>
        <nav className="sidebar-nav">
          <div className="nav-section">
            {primaryNav.map(({ label, href, icon: Icon, matches }) => (
              <Link key={href} to={projectPath(selectedProjectId, href)} className={`nav-item ${isActive(appPath, matches) ? "active" : ""}`}>
                <Icon size={17} />
                <span>{label}</span>
                {label === "Library" && pendingInboxCount > 0 ? <small>{pendingInboxCount}</small> : null}
              </Link>
            ))}
          </div>
          <div className="nav-section utility">
            {utilityNav.map(({ label, href, icon: Icon, matches }) => (
              <Link key={href} to={label === "Setup" ? href : projectPath(selectedProjectId, href)} className={`nav-item ${isActive(appPath, matches) ? "active" : ""}`}>
                <Icon size={17} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <Link className="topbar-project" to="/projects">
            <span>Project</span>
            <strong>{project?.name || "No project selected"}</strong>
          </Link>
          <div className="topbar-meta" aria-busy={store.loading}>
            {semanticRunRunning ? (
              <Link className="topbar-meta-pill semantic-run-topbar" to={projectPath(selectedProjectId, "/docs")}>
                <Activity size={15} aria-hidden="true" />
                Graph links: {semanticRunProgress}
              </Link>
            ) : null}
            <span className="topbar-meta-pill repo-count"><GitFork size={15} /> {linkedRepoCount} repos linked</span>
            <span className={`topbar-meta-pill app-ready ${semanticRunRunning ? "working" : ""}`}>
              {semanticRunRunning ? "Working" : "Ready"}
            </span>
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
