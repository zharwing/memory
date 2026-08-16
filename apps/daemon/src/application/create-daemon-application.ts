import crypto from "node:crypto";
import path from "node:path";
import { ProjectRegistry, SessionRepository } from "@zharwing/memory-store";
import type { DaemonConfig } from "../config.js";
import { DocumentService } from "../services/document-service.js";
import { ProviderSecretService } from "../services/provider-secret-service.js";
import { SessionAuthorityStore } from "../services/session-visibility.js";
import { MemoryService, type MemoryServiceOptions } from "../memory-service.js";
import type { DaemonDependencies } from "./daemon-dependencies.js";
export function createDaemonDependencies(options: MemoryServiceOptions): DaemonDependencies { const authorityNamespace = crypto.createHash("sha256").update("zharwing.memory-root.v1\0", "utf8").update(path.resolve(options.memoryRoot), "utf8").digest("hex"); const registry = new ProjectRegistry(options.memoryRoot); const sessionAuthority = new SessionAuthorityStore({ stateRoot: options.authorityStateRoot, key: options.authorityKey, namespace: authorityNamespace }); const providerSecrets = new ProviderSecretService({ namespace: authorityNamespace, stateRoot: options.providerSecretStateRoot, key: options.providerSecretKey }); return { registry, sessionAuthority, providerSecrets, documents: new DocumentService(registry), sessions: new SessionRepository(), authorityNamespace }; }
/** Production daemon composition root. MemoryService remains a compatibility facade. */
export function createDaemonApplication(config: DaemonConfig) {
  const options: MemoryServiceOptions = {
    memoryRoot: config.memoryRoot
  };
  const dependencies = createDaemonDependencies(options);
  return new MemoryService({ ...options, dependencies });
}
