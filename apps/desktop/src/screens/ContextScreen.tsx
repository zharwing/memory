import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, RawTextPreview, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";

export const ContextScreen = observer(function ContextScreen() {
  const store = useStore();
  const contextState = store.assistant.contextBundleResource.state;
  const bundle = store.assistant.contextBundle;
  const waitingForFirstBundle =
    contextState.status === "idle" ||
    contextState.status === "loading" ||
    (contextState.status === "refreshing" && !bundle);

  return (
    <Screen title="AI Context for This Session">
      <LibraryTabs />
      {waitingForFirstBundle ? (
        <p className="panel-help" role="status">Loading context preview...</p>
      ) : contextState.status === "failure" ? (
        <p className="panel-help" role="alert">The context preview could not be loaded. Refresh to try again.</p>
      ) : contextState.status === "empty" ? (
        <p className="panel-help">No context bundle is available.</p>
      ) : bundle ? (
        <>
          {contextState.status === "refreshing" ? (
            <p className="panel-help" role="status">Refreshing context preview; showing the last accepted bundle.</p>
          ) : contextState.completeness.kind === "partial" ? (
            <p className="panel-help" role="status">Showing a partial context bundle; more context may exist.</p>
          ) : null}
          <Panel title="Bundle Summary">
            <KeyValue label="Safety" value={bundle.safetyStatus || "unknown"} />
            <KeyValue label="Tokens" value={bundle.tokenEstimate || 0} />
            <KeyValue label="Included" value={bundle.includedItems?.length || 0} />
            <KeyValue label="Excluded" value={bundle.excludedItems?.length || 0} />
          </Panel>
          <RawTextPreview
            text={bundle.markdown}
            fallback="The accepted context bundle contains no Markdown body."
          />
        </>
      ) : (
        <p className="panel-help" role="status">Loading context preview...</p>
      )}
    </Screen>
  );
});
