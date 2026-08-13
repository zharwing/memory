import { CircleHelp, RotateCcw, X } from "lucide-react";
import { ToggleGroup } from "../../components/ToggleGroup.js";
import type { GraphScreenController } from "./useGraphScreenController.js";

export function GraphToolbar({ controller }: { controller: GraphScreenController["toolbar"] }) {
  const { model, actions } = controller;

  return (
    <div className="graph-view-toolbar">
        <ToggleGroup
          className="segmented-control compact graph-mode-control"
          role="group"
          ariaLabel="Graph view"
          value={model.viewMode}
          onChange={actions.setViewMode}
          options={[
            { value: "context", label: "Context map" },
            { value: "all", label: "Import audit" }
          ]}
        />
        <label className="graph-focus-control">
          <span>Focus</span>
          <select
            value={model.focusedNodeId}
            disabled={model.isRawGraph || model.focusOptions.length === 0}
            onChange={(event) => actions.setFocusFromControl(event.target.value)}
          >
            <option value="">Overview hubs</option>
            {model.focusOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {model.focusedNodeId && !model.isRawGraph ? (
          <button className="icon-text-button" type="button" onClick={actions.resetFocus}>
            <X size={14} />
            Reset focus
          </button>
        ) : null}
        {!model.isRawGraph && model.hasVisibleNodes ? (
          <button className="icon-text-button" type="button" onClick={actions.resetLayout}>
            <RotateCcw size={14} />
            Reset layout
          </button>
        ) : null}
        <button
          type="button"
          className={`icon-button icon-only graph-help-trigger ${model.showHelp ? "selected" : ""}`}
          onClick={actions.toggleHelp}
          title="About graph views"
          aria-label="About graph views"
          aria-expanded={model.showHelp}
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
    </div>
  );
}
