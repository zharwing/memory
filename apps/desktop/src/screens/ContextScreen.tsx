import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, RawTextPreview, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";

export const ContextScreen = observer(function ContextScreen() {
  const store = useStore();
  return (
    <Screen title="AI Context for This Session">
      <LibraryTabs />
      <Panel title="Bundle Summary">
        <KeyValue label="Safety" value={store.assistant.contextBundle?.safetyStatus || "unknown"} />
        <KeyValue label="Tokens" value={store.assistant.contextBundle?.tokenEstimate || 0} />
        <KeyValue label="Included" value={store.assistant.contextBundle?.includedItems?.length || 0} />
        <KeyValue label="Excluded" value={store.assistant.contextBundle?.excludedItems?.length || 0} />
      </Panel>
      <RawTextPreview text={store.assistant.contextBundle?.markdown} fallback="No context bundle available." />
    </Screen>
  );
});
