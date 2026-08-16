import type { ProjectRegistry, SessionRepository } from "@zharwing/memory-store";
import type { AuthorityService } from "../services/authority-service.js";
import type { DocumentService } from "../services/document-service.js";
import type { ProviderSecretService } from "../services/provider-secret-service.js";
import type { SessionAuthorityStore } from "../services/session-visibility.js";
/** Explicit daemon application dependencies; concrete construction belongs only to the composition root. */
export interface DaemonDependencies { readonly registry: ProjectRegistry; readonly sessionAuthority: SessionAuthorityStore; readonly providerSecrets: ProviderSecretService; readonly documents: DocumentService; readonly sessions: SessionRepository; readonly authorityNamespace: string; readonly authority?: AuthorityService; }
