import { observer } from "mobx-react-lite";
import { DocumentEditorHost } from "../../components/DocumentEditorHost.js";
import { Screen } from "../../components/layout.js";
import { LibraryTabs } from "../../components/SectionTabs.js";
import { GraphContent } from "./GraphContent.js";
import { GraphDetailsPanel } from "./GraphDetailsPanel.js";
import { GraphStatusBar } from "./GraphStatusBar.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { useGraphScreenController } from "./useGraphScreenController.js";

export const GraphScreen = observer(function GraphScreen() {
  const controller = useGraphScreenController();

  return (
    <Screen title="Graph">
      <LibraryTabs />
      <GraphToolbar controller={controller.toolbar} />
      <GraphStatusBar
        status={controller.status}
        showHelp={controller.toolbar.model.showHelp}
      />
      <div className="graph-board">
        <GraphDetailsPanel controller={controller.details} />
        <GraphContent controller={controller.content} />
      </div>
      {controller.editor.document ? (
        <DocumentEditorHost
          doc={controller.editor.document}
          documents={controller.editor.documents}
          onClose={controller.editor.close}
        />
      ) : null}
    </Screen>
  );
});
