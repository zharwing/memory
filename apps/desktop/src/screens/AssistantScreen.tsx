import { Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";

export function AssistantScreen() {
  return (
    <Screen title="Memory Assistant">
      <SettingsTabs />
      <Panel title="Local Assistant">
        <p>The assistant runtime is optional. Core project memory, sessions, search, context preview, MCP, CLI, and backups work without a model.</p>
      </Panel>
    </Screen>
  );
}
