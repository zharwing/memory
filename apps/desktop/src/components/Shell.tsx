import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { observer } from "mobx-react-lite";
import {
  Archive,
  Bot,
  Boxes,
  Cable,
  FileText,
  FolderKanban,
  GitBranch,
  Home,
  Inbox,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Waypoints
} from "lucide-react";
import { useStore } from "../stores/store-context.js";

const nav = [
  ["Dashboard", "/dashboard", Home],
  ["Current Work", "/current-work", Cable],
  ["Sessions", "/sessions", FolderKanban],
  ["Docs Library", "/docs", FileText],
  ["Diagrams", "/diagrams", Waypoints],
  ["Graph", "/graph", Network],
  ["Search", "/search", Search],
  ["Memory Inbox", "/inbox", Inbox],
  ["Context Preview", "/context", ShieldCheck],
  ["Assistant", "/assistant", Bot],
  ["Backups", "/backups", Archive],
  ["Settings", "/settings", Settings]
] as const;

export const Shell = observer(function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const project = store.selectedProject;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/projects">
          <Boxes size={22} />
          <span>AI Memory</span>
        </Link>
        <nav>
          {nav.map(([label, href, Icon]) => (
            <NavLink key={href} to={href} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon size={17} />
              <span>{label}</span>
              {label === "Memory Inbox" && store.inbox.filter((item) => item.status === "pending").length > 0 ? (
                <small>{store.inbox.filter((item) => item.status === "pending").length}</small>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Project</p>
            <h1>{project?.name || "No project selected"}</h1>
          </div>
          <div className="topbar-meta">
            <span>
              <GitBranch size={15} /> {project?.repos?.[0]?.defaultBranch || "branch unknown"}
            </span>
            <span className={`status ${store.contextBundle?.safetyStatus || "clean"}`}>
              {store.contextBundle?.safetyStatus || "clean"}
            </span>
            <span>{store.loading ? "Updating" : "Ready"}</span>
          </div>
        </header>
        {store.error ? <div className="notice danger">{store.error}</div> : null}
        {children}
      </main>
    </div>
  );
});
