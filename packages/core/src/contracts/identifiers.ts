import { parseDocumentId, type DocumentId } from "../document-id.js";
import { parseProjectId, projectIdValue, type ProjectId } from "../project-id.js";
import { ContractDecodeError, stringSchema, type RuntimeSchema } from "./runtime-schema.js";

/** Runtime authority for project identifiers at every public contract boundary. */
export const projectIdSchema: RuntimeSchema<ProjectId> = {
  description: "a canonical or accepted legacy project identifier",
  parse(value, path = "value") {
    if (typeof value !== "string") {
      throw new ContractDecodeError(path, "a string", value);
    }
    const projectId = projectIdValue(parseProjectId(value));
    if (!projectId) throw new ContractDecodeError(path, this.description, value);
    return projectId;
  }
};

/**
 * Compatibility authority for persisted document identifiers.
 *
 * Existing imports historically accepted every string value, so the wire
 * boundary preserves those bytes. The stricter decoder/factories in
 * `document-id.ts` remain the authority for newly generated IDs.
 */
export const documentIdSchema: RuntimeSchema<DocumentId> = {
  description: "a persisted document identifier string",
  parse(value, path = "value") {
    const raw = stringSchema.parse(value, path);
    const documentId = parseDocumentId(raw);
    if (!documentId) throw new ContractDecodeError(path, this.description, value);
    return documentId;
  }
};
