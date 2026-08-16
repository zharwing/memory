import { makeAutoObservable } from "mobx";
import type { AssistantClientPort } from "../application/ports/features.js";
import type { ContextBundle, OperationInput, OperationOutput } from "@zharwing/memory-core";
import { OperationLedger } from "../application/operations/operation-state.js";
import type {
  AssistantStoreCoordinator,
  ScopedProjectPort,
  ScopeToken,
  StoreAsyncRuntimePort
} from "../application/operations/store-ports.js";
import {
  ResourceSlot,
  publicErrorCopy
} from "../application/resources/resource-state.js";

type AssistantStatus = OperationOutput<"memory.assistant_status">;
type ProviderCheck = OperationOutput<"memory.check_semantic_graph_provider">;
type ProviderSecretStatus = OperationOutput<"memory.get_provider_secret_status">;

export class AssistantStore {
  providerSecretKind: string | undefined;
  readonly statusResource: ResourceSlot<AssistantStatus>;
  readonly providerCheckResource: ResourceSlot<ProviderCheck>;
  readonly providerSecretStatusResource: ResourceSlot<ProviderSecretStatus>;
  readonly contextBundleResource: ResourceSlot<ContextBundle>;
  readonly operations: OperationLedger;

  constructor(
    private readonly client: AssistantClientPort,
    private readonly scope: ScopedProjectPort,
    private readonly coordinator: AssistantStoreCoordinator,
    runtime: StoreAsyncRuntimePort
  ) {
    this.statusResource = new ResourceSlot(scope, runtime);
    this.providerCheckResource = new ResourceSlot(scope, runtime);
    this.providerSecretStatusResource = new ResourceSlot(scope, runtime);
    this.contextBundleResource = new ResourceSlot(scope, runtime);
    this.operations = new OperationLedger(runtime);
    makeAutoObservable<this, "client" | "scope" | "coordinator">(this, {
      client: false,
      scope: false,
      coordinator: false,
      statusResource: false,
      providerCheckResource: false,
      providerSecretStatusResource: false,
      contextBundleResource: false,
      operations: false
    });
  }

  get status(): AssistantStatus | undefined {
    return this.statusResource.data;
  }

  get providerCheck(): ProviderCheck | undefined {
    return this.providerCheckResource.data;
  }

  get providerSecretStatus(): ProviderSecretStatus | undefined {
    return this.providerSecretStatusResource.data;
  }

  get contextBundle(): ContextBundle | undefined {
    return this.contextBundleResource.data;
  }

  get loading(): boolean {
    return this.statusResource.loading ||
      this.providerCheckResource.loading ||
      this.providerSecretStatusResource.loading ||
      this.contextBundleResource.loading ||
      this.operations.isBusy();
  }

  get error(): string {
    return publicErrorCopy(
      this.statusResource.error ??
      this.providerCheckResource.error ??
      this.providerSecretStatusResource.error ??
      this.contextBundleResource.error ??
      this.operations.error
    );
  }

  resetProviderCheck(): void {
    this.providerSecretKind = undefined;
    this.providerCheckResource.reset();
    this.providerSecretStatusResource.reset();
  }

  clear(): void {
    this.providerSecretKind = undefined;
    this.statusResource.reset();
    this.providerCheckResource.reset();
    this.providerSecretStatusResource.reset();
    this.contextBundleResource.reset();
    this.operations.reset();
  }

  async loadStatus(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.statusResource.reset();
      return;
    }
    await this.loadStatusFor(token);
  }

  async loadContextBundle(token = this.scope.captureScope()): Promise<void> {
    if (!token) {
      this.contextBundleResource.reset();
      return;
    }
    const attempt = this.contextBundleResource.begin(token);
    if (!attempt) return;
    try {
      const contextBundle = await this.client.operation("memory.preview_context_bundle", {
        projectId: token.projectId,
        requestedBy: "desktop"
      }, { signal: token.signal });
      this.contextBundleResource.succeed(attempt, contextBundle);
    } catch (error) {
      this.contextBundleResource.fail(attempt, error);
    }
  }

  async updatePolicy(policy: Record<string, unknown>): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.update_assistant_policy",
      input: {
        projectId: token.projectId,
        policy
      },
      ledger: this.operations,
      key: "update-assistant-policy",
      scope: token
    });
  }

  async checkProvider(
    args: Omit<OperationInput<"memory.check_semantic_graph_provider">, "projectId"> = {}
  ): Promise<ProviderCheck | undefined> {
    const token = this.scope.captureScope();
    if (!token) return undefined;
    const attempt = this.providerCheckResource.begin(token);
    if (!attempt) return undefined;
    try {
      const checked = await this.client.operation("memory.check_semantic_graph_provider", {
        ...args,
        projectId: token.projectId
      }, { signal: token.signal });
      return this.providerCheckResource.succeed(attempt, checked) ? checked : undefined;
    } catch (error) {
      this.providerCheckResource.fail(attempt, error);
      return undefined;
    }
  }

  async loadProviderSecretStatus(providerKind: string): Promise<void> {
    this.providerSecretKind = providerKind;
    const token = this.scope.captureScope();
    if (!token) {
      this.providerSecretStatusResource.reset();
      return;
    }
    const attempt = this.providerSecretStatusResource.begin(token);
    if (!attempt) return;
    try {
      const status = await this.client.operation("memory.get_provider_secret_status", {
        projectId: token.projectId,
        providerKind
      }, { signal: token.signal });
      this.providerSecretStatusResource.succeed(attempt, status);
    } catch (error) {
      this.providerSecretStatusResource.fail(attempt, error);
    }
  }

  async saveProviderSecret(providerKind: string, secret: string): Promise<boolean> {
    this.providerSecretKind = providerKind;
    const token = this.scope.captureScope();
    if (!token || !secret) return false;
    const current = this.providerSecretStatus;
    const status = current?.configured && current.providerKind === providerKind && current.revision
      ? await this.coordinator.executeCommand({
          port: this.client,
          operation: "memory.rotate_provider_secret",
          input: {
            projectId: token.projectId,
            providerKind,
            secret,
            expectedRevision: current.revision
          },
          ledger: this.operations,
          key: "save-provider-secret",
          scope: token
        })
      : await this.coordinator.executeCommand({
          port: this.client,
          operation: "memory.set_provider_secret",
          input: { projectId: token.projectId, providerKind, secret },
          ledger: this.operations,
          key: "save-provider-secret",
          scope: token
        });
    return Boolean(status);
  }

  async clearProviderSecret(): Promise<boolean> {
    const token = this.scope.captureScope();
    const current = this.providerSecretStatus;
    if (!token || !current?.configured || !current.revision) return false;
    this.providerSecretKind = current.providerKind;
    const status = await this.coordinator.executeCommand({
      port: this.client,
      operation: "memory.clear_provider_secret",
      input: {
        projectId: token.projectId,
        providerKind: current.providerKind,
        expectedRevision: current.revision
      },
      ledger: this.operations,
      key: "clear-provider-secret",
      scope: token
    });
    return Boolean(status);
  }

  private async loadStatusFor(token: ScopeToken): Promise<void> {
    const attempt = this.statusResource.begin(token);
    if (!attempt) return;
    try {
      const status = await this.client.operation("memory.assistant_status", {
        projectId: token.projectId
      }, { signal: token.signal });
      this.statusResource.succeed(attempt, status);
    } catch (error) {
      this.statusResource.fail(attempt, error);
    }
  }

}
