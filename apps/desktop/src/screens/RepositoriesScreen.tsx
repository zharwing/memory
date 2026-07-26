import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Panel, Screen } from "../components/layout.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { DirectoryField } from "../components/DirectoryField.js";
import { ListRow } from "../components/ListRow.js";

export const RepositoriesScreen = observer(function RepositoriesScreen() {
  const store = useStore();
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [writePointerFile, setWritePointerFile] = useState(true);

  useEffect(() => {
    if (store.selectedProjectId) void store.loadRepoLinks();
  }, [store, store.selectedProjectId]);

  const projectName = store.selectedProject?.name || "this project";
  const hasLinkedRepos = store.repoLinks.length > 0;

  return (
    <Screen title="Repositories" actions={<button disabled={!store.selectedProjectId} onClick={() => store.loadRepoLinks()}>Refresh</button>}>
      {store.selectedProjectId && !hasLinkedRepos ? (
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
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          void store.linkRepo({
            repoPath,
            role: role || "other",
            name: repoName,
            description,
            defaultBranch,
            writePointerFile
          }).then(() => {
            setRepoPath("");
            setRepoName("");
            setRole("");
            setDescription("");
            setDefaultBranch("");
          });
        }}>
          <label>
            <span>Repo path</span>
            <DirectoryField value={repoPath} onChange={setRepoPath} placeholder="<absolute-path-to-repo-root>" required />
          </label>
          <p className="field-help">
            Use the folder that contains the repo's `.git` directory, or any folder inside that repo.
            Zharwing Memory will resolve it to the repo root.
          </p>
          <label>
            <span>Name</span>
            <input value={repoName} onChange={(event) => setRepoName(event.target.value)} placeholder="Product web runtime" />
          </label>
          <label>
            <span>Category</span>
            <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="service, app, docs, worker, wrapper" />
          </label>
          <label>
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this repository owns" rows={3} />
          </label>
          <label>
            <span>Default branch</span>
            <input value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} placeholder="main" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={writePointerFile} onChange={(event) => setWritePointerFile(event.target.checked)} />
            <span>Write pointer file</span>
          </label>
          <p className="field-help">
            Pointer files are small `.zharwing/memory.json` files in linked repos (legacy `.ai-memory.json` files are still detected). They help agents auto-detect this project from the repo.
          </p>
          <button type="submit" disabled={!store.selectedProjectId}>Link Repo</button>
        </form>
      </Panel>
      {store.selectedProjectId && hasLinkedRepos ? (
        <Panel title="Next: Import Existing Memory">
          <p className="panel-help">
            Repos are linked. Open Import next, preview old MEMORY folders as Memory Docs,
            then preview old SESSIONS folders as Session History before committing them.
          </p>
        </Panel>
      ) : null}
      <Panel title="Linked Repos">
        {store.repoLinks.length ? (
          <div className="repo-list">
            {store.repoLinks.map((repo) => (
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
                    onConfirm={() => store.deleteRepo(repo.path, true)}
                  />
                }
              />
            ))}
          </div>
        ) : (
          <Empty text="No repos linked to this project." />
        )}
      </Panel>
    </Screen>
  );
});
