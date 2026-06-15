import { nowIso, type GraphEdge, type GraphNode, type MemoryDocument, type Project, type ProjectGraph, type Session } from "@aimem/core";

export interface BuildGraphInput {
  project: Project;
  sessions: Session[];
  documents: MemoryDocument[];
}

export function buildProjectGraph(input: BuildGraphInput): ProjectGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  addNode(nodes, {
    id: `project:${input.project.id}`,
    projectId: input.project.id,
    type: "project",
    label: input.project.name,
    path: input.project.memoryRoot
  });

  for (const repo of input.project.repos) {
    const repoId = `repo:${repo.path}`;
    addNode(nodes, {
      id: repoId,
      projectId: input.project.id,
      type: "repo",
      label: repo.path.split(/[\\/]/).pop() || repo.path,
      path: repo.path
    });
    edges.push(edge(input.project.id, repoId, `project:${input.project.id}`, "belongs-to", "Repo is linked to project"));
  }

  for (const session of input.sessions) {
    const sessionId = `session:${session.id}`;
    addNode(nodes, {
      id: sessionId,
      projectId: input.project.id,
      type: "session",
      label: session.taskTitle,
      status: session.status,
      path: session.filePath
    });
    edges.push(edge(input.project.id, sessionId, `project:${input.project.id}`, "belongs-to", "Session belongs to project"));

    if (session.taskTitle) {
      const taskId = `task:${session.taskTitle.toLowerCase()}`;
      addNode(nodes, {
        id: taskId,
        projectId: input.project.id,
        type: "task",
        label: session.taskTitle
      });
      edges.push(edge(input.project.id, sessionId, taskId, "works-on", "Session works on task"));
    }

    for (const file of session.touchedFiles) {
      const fileId = `file:${file}`;
      addNode(nodes, {
        id: fileId,
        projectId: input.project.id,
        type: "file",
        label: file,
        path: file
      });
      edges.push(edge(input.project.id, sessionId, fileId, "touched", "Session touched file"));
    }

    for (const docId of session.relatedDocs) {
      edges.push(edge(input.project.id, sessionId, `doc:${docId}`, "referenced", "Session references document"));
    }
  }

  for (const doc of input.documents) {
    const nodeType = doc.type === "diagram" ? "diagram" : doc.type.includes("decision") ? "decision" : doc.type === "command-note" || doc.type === "commands" ? "command" : doc.type === "gotcha" ? "gotcha" : "doc";
    const docNodeId = `doc:${doc.id}`;
    addNode(nodes, {
      id: docNodeId,
      projectId: input.project.id,
      type: nodeType,
      label: doc.title,
      status: doc.status,
      visibility: doc.visibility,
      path: doc.filePath,
      lastVerified: doc.lastVerified
    });
    edges.push(edge(input.project.id, docNodeId, `project:${input.project.id}`, "belongs-to", "Document belongs to project"));

    for (const relatedSession of doc.relatedSessions) {
      edges.push(edge(input.project.id, `session:${relatedSession}`, docNodeId, "referenced", "Document metadata links to session"));
    }
    for (const relatedFile of doc.relatedFiles) {
      const fileId = `file:${relatedFile}`;
      addNode(nodes, {
        id: fileId,
        projectId: input.project.id,
        type: "file",
        label: relatedFile,
        path: relatedFile
      });
      edges.push(edge(input.project.id, docNodeId, fileId, doc.type === "diagram" ? "explains" : "supports", "Document metadata links to file"));
    }
    for (const relatedDiagram of doc.relatedDiagrams) {
      edges.push(edge(input.project.id, docNodeId, `doc:${relatedDiagram}`, "uses", "Document metadata links to diagram"));
    }
  }

  return {
    projectId: input.project.id,
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
    generated: nowIso()
  };
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function edge(projectId: string, from: string, to: string, type: GraphEdge["type"], reason: string): GraphEdge {
  return {
    id: `${from}->${type}->${to}`,
    projectId,
    from,
    to,
    type,
    reason
  };
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  return [...new Map(edges.map((candidate) => [candidate.id, candidate])).values()];
}
