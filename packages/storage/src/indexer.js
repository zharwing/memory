import path from "node:path";
import { writeJson } from "./fs.js";
import { listProjectDocuments } from "./documents.js";
import { listProposedUpdates } from "./inbox.js";
import { listProjectSessions } from "./sessions.js";
import { listProjectWorkstreams } from "./workstreams.js";
export async function rebuildProjectIndex(project) {
    const sessions = await listProjectSessions(project);
    const documents = await listProjectDocuments(project);
    const workstreams = await listProjectWorkstreams(project);
    const proposals = await listProposedUpdates(project);
    const indexPath = path.join(project.memoryRoot, "generated", "index.json");
    await writeJson(indexPath, {
        projectId: project.id,
        workstreams: workstreams.map(workstreamIndex),
        sessions: sessions.map(sessionIndex),
        documents: documents.map(documentIndex),
        proposals: proposals.map(proposalIndex)
    });
    return {
        projectId: project.id,
        indexPath,
        counts: {
            sessions: sessions.length,
            documents: documents.length,
            workstreams: workstreams.length,
            proposals: proposals.length
        }
    };
}
function workstreamIndex(workstream) {
    return {
        id: workstream.id,
        name: workstream.name,
        slug: workstream.slug,
        status: workstream.status,
        updated: workstream.updated,
        path: workstream.filePath,
        topics: workstream.topics,
        relatedTasks: workstream.relatedTasks
    };
}
function sessionIndex(session) {
    return {
        id: session.id,
        title: session.taskTitle,
        status: session.status,
        updated: session.updated,
        path: session.filePath,
        touchedFiles: session.touchedFiles
    };
}
function documentIndex(doc) {
    return {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        status: doc.status,
        visibility: doc.visibility,
        updated: doc.updated,
        path: doc.filePath,
        topics: doc.topics,
        relatedFiles: doc.relatedFiles
    };
}
function proposalIndex(proposal) {
    return {
        id: proposal.id,
        type: proposal.type,
        status: proposal.status,
        created: proposal.created,
        confidence: proposal.confidence,
        targetDocument: proposal.targetDocument
    };
}
//# sourceMappingURL=indexer.js.map