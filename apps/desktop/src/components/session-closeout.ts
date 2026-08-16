import type { Session, SessionSummary } from "@zharwing/memory-core";

export type SessionCloseoutOutcome = Pick<
  Session | SessionSummary,
  "id" | "status" | "includeInGraph"
>;

export interface SessionCloseoutMutationPort {
  closeSession(
    sessionId: string,
    summary?: string,
    includeInGraph?: boolean
  ): Promise<SessionCloseoutOutcome | undefined>;
}

/**
 * A close succeeds only when the mutation itself returns the closed session.
 * Resource re-observation is deliberately not used as an acknowledgement: it
 * can lag or fail independently after the durable close has completed.
 */
export async function executeSessionCloseout({
  sessions,
  sessionId,
  summary,
  includeInGraph
}: {
  sessions: SessionCloseoutMutationPort;
  sessionId: string;
  summary: string;
  includeInGraph: boolean;
}): Promise<SessionCloseoutOutcome | undefined> {
  const closed = await sessions.closeSession(sessionId, summary, includeInGraph);
  return closed?.status === "closed" && closed.includeInGraph === includeInGraph
    ? closed
    : undefined;
}
