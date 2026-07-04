import { NavLink } from "react-router-dom";

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
  return <SectionTabs tabs={libraryTabs} />;
}

export function SettingsTabs() {
  return <SectionTabs tabs={settingsTabs} />;
}

export function SectionTabs({ tabs }: { tabs: readonly (readonly [string, string])[] }) {
  return (
    <nav className="section-tabs" aria-label="Section navigation">
      {tabs.map(([label, href]) => (
        <NavLink key={href} to={href} className={({ isActive }) => `section-tab ${isActive ? "active" : ""}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
