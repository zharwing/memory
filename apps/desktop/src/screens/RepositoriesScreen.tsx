import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Panel, Screen } from "../components/layout.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { DirectoryField } from "../components/DirectoryField.js";
import { ListRow } from "../components/ListRow.js";
import {
  ErrorSummary,
  TextAreaField,
  TextField,
  type FormError
} from "../components/FormField.js";
import { useAsyncAction } from "../utils/useAsyncAction.js";
import { useDraft } from "../hooks/useDraft.js";

interface RepositoryDraft {
  repoPath: string;
  repoName: string;
  role: string;
  description: string;
  defaultBranch: string;
  writePointerFile: boolean;
}

const REPOSITORY_DRAFT_DEFAULTS: RepositoryDraft = {
  repoPath: "",
  repoName: "",
  role: "",
  description: "",
  defaultBranch: "",
  writePointerFile: true
};

export const RepositoriesScreen = observer(function RepositoriesScreen() {
  const store = useStore();
  const [draft, patchDraft, setDraft] = useDraft<RepositoryDraft>(REPOSITORY_DRAFT_DEFAULTS);
  const [formErrors, setFormErrors] = useState<FormError[]>([]);
  const submit = useAsyncAction();
  const { repoPath, repoName, role, description, defaultBranch, writePointerFile } = draft;

  useEffect(() => {
    if (store.projects.selectedProjectId) void store.projects.loadRepoLinks();
  }, [store, store.projects.selectedProjectId]);

  const projectName = store.projects.selectedProject?.name || "this project";
  const hasLinkedRepos = store.projects.repoLinks.length > 0;
  const repoLinksState = store.projects.repoLinksState;

  return (
    <Screen title="Repositories" actions={<button type="button" disabled={!store.projects.selectedProjectId} onClick={() => store.projects.loadRepoLinks()}>Refresh</button>}>
      {store.projects.selectedProjectId && repoLinksState.status === "empty" ? (
        <Panel title="Next: Add Repositories">
          <ol className="setup-steps">
            <li>Add every code repo that belongs to {projectName}.</li>
            <li>Use the Git repo root folder, not the memory store and not old docs folders.</li>
            <li>Keep pointer files enabled so agents can detect this memory project from each repo.</li>
            <li>After repos are linked, open Import to bring in old memory and sessions.</li>
          </ol>
          <div className="path-examples">
            <code>&lt;frontend-repo-root&gt;</code>
            <code>&lt;service-repo-root&gt;</code>
            <code>&lt;worker-repo-root&gt;</code>
          </div>
        </Panel>
      ) : null}
      <Panel title="How Repo Links Work">
        <div className="setup-guidance">
          <strong>Link Git repo roots, not memory folders</strong>
          <p>
            Add every code repo that belongs to this memory project. A monorepo should be linked once at its repo root.
            Separate microservice or frontend repos should be linked one by one.
          </p>
        </div>
      </Panel>
      <Panel title="Link Repo">
        <form className="stacked-form" aria-busy={submit.pending} onSubmit={(event) => {
          event.preventDefault();
          const errors: FormError[] = [];
          if (!repoPath.trim()) errors.push({ id: "repository-path", message: "Choose or enter a repository folder." });
          setFormErrors(errors);
          if (errors.length || submit.pending) return;
          const previousCount = store.projects.repoLinks.length;
          void submit.run(async () => {
            await store.projects.linkRepo({
              repoPath,
              role: role || "other",
              name: repoName,
              description,
              defaultBranch,
              writePointerFile
            });
            if (store.projects.repoLinks.length > previousCount) {
              // Preserve the user's pointer-file choice across successful links.
              setDraft((current) => ({
                ...REPOSITORY_DRAFT_DEFAULTS,
                writePointerFile: current.writePointerFile
              }));
            }
          });
        }}>
          <ErrorSummary errors={formErrors} />
          <label htmlFor="repository-path">Repo path</label>
          <DirectoryField
            id="repository-path"
            value={repoPath}
            onChange={(value) => { patchDraft({ repoPath: value }); setFormErrors([]); }}
            placeholder="<absolute-path-to-repo-root>"
            describedBy={`repository-path-help${formErrors.length ? " repository-path-error" : ""}`}
            invalid={formErrors.length > 0}
            required
          />
          <p id="repository-path-help" className="field-help">
            Use the folder that contains the repo's `.git` directory, or any folder inside that repo.
            Zharwing Memory will resolve it to the repo root.
          </p>
          {formErrors.length ? <p id="repository-path-error" className="field-error">Choose or enter a repository folder.</p> : null}
          <TextField label="Name" id="repository-name" value={repoName} onChange={(event) => patchDraft({ repoName: event.target.value })} placeholder="Product web runtime" autoComplete="off" />
          <TextField label="Category" id="repository-category" value={role} onChange={(event) => patchDraft({ role: event.target.value })} placeholder="service, app, docs, worker, wrapper" autoComplete="off" />
          <TextAreaField label="Description" id="repository-description" value={description} onChange={(event) => patchDraft({ description: event.target.value })} placeholder="What this repository owns" rows={3} />
          <TextField label="Default branch" id="repository-default-branch" value={defaultBranch} onChange={(event) => patchDraft({ defaultBranch: event.target.value })} placeholder="main" autoComplete="off" spellCheck={false} />
          <label className="checkbox-row">
            <input type="checkbox" checked={writePointerFile} onChange={(event) => patchDraft({ writePointerFile: event.target.checked })} />
            <span>Write pointer file</span>
          </label>
          <p className="field-help">
            Pointer files are small `.zharwing/memory.json` files in linked repos (legacy `.ai-memory.json` files are still detected). They help agents auto-detect this project from the repo.
          </p>
          <button type="submit" disabled={!store.projects.selectedProjectId || submit.pending} aria-busy={submit.pending}>{submit.pending ? "Linking…" : "Link Repo"}</button>
        </form>
      </Panel>
      {store.projects.selectedProjectId && hasLinkedRepos ? (
        <Panel title="Next: Import Existing Memory">
          <p className="panel-help">
            Repos are linked. Open Import next, preview old MEMORY folders as Memory Docs,
            then preview old SESSIONS folders as Session History before committing them.
          </p>
        </Panel>
      ) : null}
      <Panel title="Linked Repos">
        {repoLinksState.status === "idle" || repoLinksState.status === "loading" ? (
          <p className="panel-help" role="status">Loading repositories...</p>
        ) : store.projects.repoLinks.length ? (
          <div className="repo-list">
            {store.projects.repoLinks.map((repo) => (
              <ListRow
                key={repo.path}
                title={repo.name || repo.path.split(/[\\/]/).pop() || repo.role}
                details={
                  <>
                    <span>{repo.path}</span>
                    <small>{[repo.role, repo.defaultBranch || "branch unknown"].filter(Boolean).join(" / ")}</small>
                    {repo.description ? <p>{repo.description}</p> : null}
                  </>
                }
                actions={
                  <ConfirmDeleteButton
                    itemType="repo"
                    title={repo.name || repo.path}
                    label="Move to Trash"
                    onConfirm={() => store.projects.deleteRepo(repo.path, true)}
                  />
                }
              />
            ))}
          </div>
        ) : repoLinksState.status === "empty" ? (
          <Empty text="No repos linked to this project." />
        ) : null}
      </Panel>
    </Screen>
  );
});
