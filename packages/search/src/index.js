export function searchProjectMemory(corpus, query) {
    const terms = tokenize(query);
    if (terms.length === 0)
        return [];
    const results = [
        ...(corpus.workstreams || []).map((workstream) => scoreWorkstream(corpus.projectId, workstream, terms)),
        ...corpus.sessions.map((session) => scoreSession(corpus.projectId, session, terms)),
        ...corpus.documents.map((doc) => scoreDocument(corpus.projectId, doc, terms)),
        ...corpus.proposals.map((proposal) => scoreProposal(corpus.projectId, proposal, terms)),
        ...(corpus.bundles || []).map((bundle) => scoreBundle(corpus.projectId, bundle, terms))
    ].filter((result) => Boolean(result && result.score > 0));
    return results.sort((a, b) => b.score - a.score || (b.updated || "").localeCompare(a.updated || ""));
}
function scoreWorkstream(projectId, workstream, terms) {
    const body = [
        workstream.name,
        workstream.slug,
        workstream.summary,
        workstream.goal,
        workstream.topics.join(" "),
        workstream.relatedTasks.join(" "),
        workstream.relatedFiles.join(" "),
        workstream.body
    ].join("\n");
    const score = scoreText(body, terms);
    if (score <= 0)
        return undefined;
    return {
        id: workstream.id,
        projectId,
        type: "workstream",
        title: workstream.name,
        path: workstream.filePath,
        status: workstream.status,
        updated: workstream.updated,
        snippet: snippet(body, terms),
        score
    };
}
function scoreSession(projectId, session, terms) {
    const body = [
        session.taskTitle,
        session.goal,
        session.summary,
        session.nextSteps.join(" "),
        session.blockers.join(" "),
        session.touchedFiles.join(" "),
        session.body
    ].join("\n");
    const score = scoreText(body, terms);
    if (score <= 0)
        return undefined;
    return {
        id: session.id,
        projectId,
        type: "session",
        title: session.taskTitle,
        path: session.filePath,
        status: session.status,
        updated: session.updated,
        snippet: snippet(body, terms),
        score
    };
}
function scoreDocument(projectId, doc, terms) {
    const body = [doc.title, doc.type, doc.topics.join(" "), doc.relatedFiles.join(" "), doc.body].join("\n");
    const score = scoreText(body, terms);
    if (score <= 0)
        return undefined;
    return {
        id: doc.id,
        projectId,
        type: "document",
        title: doc.title,
        path: doc.filePath,
        status: doc.status,
        visibility: doc.visibility,
        updated: doc.updated,
        snippet: snippet(body, terms),
        score
    };
}
function scoreProposal(projectId, proposal, terms) {
    const body = [proposal.type, proposal.reason, proposal.proposedPatch, proposal.affectedFiles.join(" ")].join("\n");
    const score = scoreText(body, terms);
    if (score <= 0)
        return undefined;
    return {
        id: proposal.id,
        projectId,
        type: "proposed-update",
        title: `${proposal.type}: ${proposal.reason.slice(0, 80)}`,
        status: proposal.status,
        updated: proposal.created,
        snippet: snippet(body, terms),
        score
    };
}
function scoreBundle(projectId, bundle, terms) {
    const body = bundle.markdown;
    const score = scoreText(body, terms);
    if (score <= 0)
        return undefined;
    return {
        id: bundle.id,
        projectId,
        type: "context-bundle",
        title: `Context bundle ${bundle.created}`,
        status: bundle.safetyStatus,
        updated: bundle.created,
        snippet: snippet(body, terms),
        score
    };
}
function scoreText(input, terms) {
    const lower = input.toLowerCase();
    return terms.reduce((score, term) => {
        const exact = lower.includes(term) ? 8 : 0;
        const occurrences = lower.split(term).length - 1;
        return score + exact + occurrences;
    }, 0);
}
function snippet(input, terms) {
    const lower = input.toLowerCase();
    const index = Math.max(0, Math.min(...terms.map((term) => {
        const found = lower.indexOf(term);
        return found === -1 ? Number.POSITIVE_INFINITY : found;
    })));
    const start = Number.isFinite(index) ? Math.max(0, index - 80) : 0;
    return input.slice(start, start + 220).replace(/\s+/g, " ").trim();
}
function tokenize(query) {
    return query
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .filter((term) => term.length > 1);
}
//# sourceMappingURL=index.js.map