import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";

export const ContextScreen = observer(function ContextScreen() {
  const store = useStore();
  return (
    <Screen title="AI Context for This Session">
      <LibraryTabs />
      <Panel title="Bundle Summary">
        <KeyValue label="Safety" value={store.contextBundle?.safetyStatus || "unknown"} />
        <KeyValue label="Tokens" value={store.contextBundle?.tokenEstimate || 0} />
        <KeyValue label="Included" value={store.contextBundle?.includedItems?.length || 0} />
        <KeyValue label="Excluded" value={store.contextBundle?.excludedItems?.length || 0} />
      </Panel>
      <pre className="markdown-preview">{store.contextBundle?.markdown || "No context bundle available."}</pre>
    </Screen>
  );
});
