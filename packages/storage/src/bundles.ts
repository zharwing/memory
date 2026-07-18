import path from "node:path";
import type { ContextBundle, Project } from "@zharwing/memory-core";
import { writeJson, writeText } from "./fs.js";

export async function saveContextBundle(project: Project, bundle: ContextBundle): Promise<ContextBundle> {
  const markdownPath = path.join(project.memoryRoot, "generated", "context-bundles", `${bundle.id}.md`);
  const auditPath = path.join(project.memoryRoot, "audit", "context-bundles", `${bundle.id}.json`);

  await writeText(markdownPath, bundle.markdown);
  await writeJson(auditPath, {
    id: bundle.id,
    projectId: bundle.projectId,
    sessionId: bundle.sessionId,
    created: bundle.created,
    requestedBy: bundle.requestedBy,
    includedItems: bundle.includedItems.map(({ content, ...item }) => item),
    excludedItems: bundle.excludedItems,
    redactions: bundle.redactions,
    tokenEstimate: bundle.tokenEstimate,
    safetyStatus: bundle.safetyStatus
  });

  return { ...bundle, auditLogPath: auditPath };
}
