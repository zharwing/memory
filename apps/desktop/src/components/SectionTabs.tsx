import { NavLink, useLocation } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { appPathFromPathname, projectPath } from "../utils/routes.js";
import { pendingInboxItems } from "../utils/inbox.js";

const workTabs = [
  ["Current Work", "/current-work"],
  ["Sessions", "/sessions"],
  ["Workstreams", "/workstreams"]
] as const;

const libraryTabs = [
  ["Docs", "/docs"],
  ["Diagrams", "/diagrams"],
  ["Inbox", "/inbox"],
  ["Graph", "/graph"],
  ["Context", "/context"]
] as const;

const settingsTabs = [
  ["Project", "/settings"],
  ["Setup", "/setup"],
  ["Assistant", "/assistant"],
  ["Backups", "/backups"]
] as const;

export function WorkTabs() {
  return <SectionTabs tabs={workTabs} />;
}

export function LibraryTabs() {
  const store = useStore();
  const pendingInboxCount = pendingInboxItems(store.inbox).length;
  return <SectionTabs tabs={libraryTabs} badges={{ "/inbox": pendingInboxCount }} />;
}

export function SettingsTabs() {
  return <SectionTabs tabs={settingsTabs} />;
}

export function SectionTabs({
  tabs,
  badges = {}
}: {
  tabs: readonly (readonly [string, string])[];
  badges?: Record<string, number>;
}) {
  const store = useStore();
  const location = useLocation();
  const appPath = appPathFromPathname(location.pathname);
  return (
    <nav className="section-tabs" aria-label="Section navigation">
      {tabs.map(([label, href]) => (
        <NavLink
          key={href}
          to={projectPath(store.selectedProjectId, href)}
          className={() => `section-tab ${appPath === href ? "active" : ""}`}
        >
          {label}
          {badges[href] > 0 ? <small>{badges[href]}</small> : null}
        </NavLink>
      ))}
    </nav>
  );
}
