import { type ReactNode, useEffect, useLayoutEffect, useReducer, useRef } from "react";
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
import { RecoveryPanel } from "../app/recovery/index.js";
import { localDiagnostics } from "../platform/diagnostics/index.js";
import { useStore } from "../stores/store-context.js";
import type { AppRecoveryState } from "../stores/root-store.js";
import {
  currentScreenRouteId,
  navigationRoutes,
  routeIsActive,
  routePath,
  type RouteNavigationEntry
} from "../utils/routes.js";
import { pendingInboxReviewCount } from "../utils/inbox.js";
import { semanticRunStatus } from "../features/semantic-review/index.js";

const primaryNav = navigationRoutes("primary");
const utilityNav = navigationRoutes("utility");
const navigationIcons: Record<RouteNavigationEntry["icon"], typeof Home> = {
  home: Home, repos: GitFork, work: Cable, library: FileText, import: Upload,
  search: Search, setup: Wrench, trash: Trash2, settings: Settings
};

export const Shell = observer(function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const [, refreshSessionTruth] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => localDiagnostics.subscribe((event) => {
    if (event?.name === "browser.session.state") refreshSessionTruth();
  }), []);
  const project = store.projects.selectedProject;
  const location = useLocation();
  const currentRouteId = currentScreenRouteId(location.pathname);
  const selectedProjectId = project?.id || store.projects.selectedProjectId;
  const pendingInboxCount = pendingInboxReviewCount(store.inbox.items);
  const linkedRepoCount = store.projects.repoLinks.length || project?.repos?.length || 0;
  const semanticRun = store.semantic.analysisProgressRun || store.semantic.status?.runCounts?.latest;
  const { running: semanticRunRunning, progressLabel: semanticRunProgress } = semanticRunStatus(semanticRun, store.semantic.analysisRunning);
  const recovery = store.recoveryState;
  const routeContent = useRef<HTMLDivElement>(null);
  const routeFocusBeforeLock = useRef<HTMLElement | null>(null);
  const routeWasInteractionLocked = useRef(false);
  const routeInteractionLocked = recovery.status === "locked" || recovery.status === "reconciling";
  useLayoutEffect(() => {
    if (routeInteractionLocked) {
      if (!routeWasInteractionLocked.current) {
        const active = document.activeElement;
        routeFocusBeforeLock.current = active instanceof HTMLElement && routeContent.current?.contains(active)
          ? active
          : null;
      }
      routeContent.current?.setAttribute("inert", "");
    } else {
      routeContent.current?.removeAttribute("inert");
      if (routeWasInteractionLocked.current) {
        if (routeFocusBeforeLock.current?.isConnected) routeFocusBeforeLock.current.focus();
        else routeContent.current?.focus();
        routeFocusBeforeLock.current = null;
      }
    }
    routeWasInteractionLocked.current = routeInteractionLocked;
  }, [routeInteractionLocked]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <Link className="brand" to={routePath("dashboard", { projectId: selectedProjectId })}>
          <Boxes size={22} aria-hidden="true" />
          <span>Zharwing Memory</span>
        </Link>
        <Link className="project-switcher" to={routePath("projects")}>
          <span>Project</span>
          <strong>{project?.name || "Select project"}</strong>
          <small>Switch, create, delete</small>
        </Link>
        <nav className="sidebar-nav" aria-label="Application navigation">
          <NavigationSection entries={primaryNav} currentRouteId={currentRouteId} projectId={selectedProjectId} pendingInboxCount={pendingInboxCount} />
          <NavigationSection className="utility" entries={utilityNav} currentRouteId={currentRouteId} projectId={selectedProjectId} />
        </nav>
      </aside>
      <main id="main-content" className="workspace" tabIndex={-1}>
        <header className="topbar">
          <Link className="topbar-project" to={routePath("projects")}>
            <span>Project</span>
            <strong>{project?.name || "No project selected"}</strong>
          </Link>
          <div className="topbar-meta" aria-busy={store.loading}>
            {semanticRunRunning ? (
              <Link className="topbar-meta-pill semantic-run-topbar" to={routePath("docs", { projectId: selectedProjectId })}>
                <Activity size={15} aria-hidden="true" />
                Graph links: {semanticRunProgress}
              </Link>
            ) : null}
            <span className="topbar-meta-pill repo-count"><GitFork size={15} aria-hidden="true" /> {linkedRepoCount} repos linked</span>
            <span className={`topbar-meta-pill app-ready ${semanticRunRunning || recovery.status !== "ready" ? "working" : ""}`}>
              {semanticRunRunning ? "Working" : recoveryStatusLabel(recovery)}
            </span>
          </div>
        </header>
        <ApplicationRecoveryNotice recovery={recovery} onRecover={() => store.recover()} />
        <div ref={routeContent} className="route-content" tabIndex={-1} aria-busy={recovery.status === "reconciling"}>
          {children}
        </div>
      </main>
    </div>
  );
});

function NavigationSection({
  entries,
  currentRouteId,
  projectId,
  pendingInboxCount = 0,
  className = ""
}: {
  entries: readonly RouteNavigationEntry[];
  currentRouteId: string | undefined;
  projectId: string | undefined;
  pendingInboxCount?: number;
  className?: string;
}) {
  return (
    <div className={`nav-section ${className}`.trim()}>
      {entries.map((entry) => {
        const Icon = navigationIcons[entry.icon];
        const active = routeIsActive(currentRouteId, entry.activeRouteIds);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`nav-item ${active ? "active" : ""}`}
            key={entry.routeId}
            to={routePath(entry.routeId, { projectId })}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{entry.label}</span>
            {entry.routeId === "docs" && pendingInboxCount > 0 ? <small>{pendingInboxCount}</small> : null}
          </Link>
        );
      })}
    </div>
  );
}

function ApplicationRecoveryNotice({
  recovery,
  onRecover
}: {
  readonly recovery: AppRecoveryState;
  readonly onRecover: () => Promise<void>;
}) {
  if (recovery.status === "ready") return null;
  if (recovery.status === "locked") {
    return (
      <RecoveryPanel
        compact
        surface="session"
        error={recovery.error}
        title="Session locked"
        detail={lockedCopy(recovery.reason)}
      />
    );
  }
  if (recovery.status === "reconciling") {
    return (
      <RecoveryPanel
        compact
        surface="operation"
        error={recovery.error}
        title="An operation has an uncertain outcome"
        detail="Refresh authoritative data before attempting the action again."
        onRecover={() => onRecover()}
      />
    );
  }
  if (recovery.status === "offline") {
    return (
      <RecoveryPanel
        compact
        focusOnMount={false}
        surface="resource"
        error={recovery.error}
        title="Local service unavailable"
        detail={recovery.staleResourceCount > 0
          ? `Showing ${recovery.staleResourceCount} last accepted observation${recovery.staleResourceCount === 1 ? "" : "s"}. They may be stale.`
          : "Current information is unavailable. No cached observation is being presented as current."}
        onRecover={() => onRecover()}
      />
    );
  }
  if (recovery.status === "stale") {
    return (
      <RecoveryPanel
        compact
        focusOnMount={false}
        surface="resource"
        error={recovery.error}
        title="Showing stale information"
        detail={`${recovery.staleResourceCount} observation${recovery.staleResourceCount === 1 ? " is" : "s are"} from the last successful refresh.`}
        onRecover={() => onRecover()}
      />
    );
  }
  return (
    <RecoveryPanel
      compact
      focusOnMount={false}
      surface="operation"
      error={recovery.error}
      title="A request could not be completed"
      onRecover={() => onRecover()}
    />
  );
}

function lockedCopy(reason: Extract<AppRecoveryState, { status: "locked" }>["reason"]): string {
  switch (reason) {
    case "bootstrap-required": return "A trusted launcher session is required. Reload from the launcher to continue.";
    case "exchange-failed": return "The trusted session could not be established. Reload from the launcher to try again.";
    case "expired": return "This session expired. Reload from the launcher to continue.";
    case "project-rebinding": return "Project authority is being rebound. Wait or reload before continuing.";
    case "revoked": return "This session was revoked. Reload from the launcher to continue.";
    case "rotating": return "Session authority is rotating. Wait or reload before continuing.";
    case "unauthorized": return "This session is no longer authorized. Reload from the launcher to continue.";
    case "forbidden": return "This session cannot perform the requested action.";
  }
}

function recoveryStatusLabel(recovery: AppRecoveryState): string {
  switch (recovery.status) {
    case "ready": return "Ready";
    case "locked": return "Locked";
    case "reconciling": return "Reconcile";
    case "offline": return "Offline";
    case "stale": return "Stale";
    case "failed": return "Attention";
  }
}
