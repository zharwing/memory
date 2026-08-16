import {
  ContractDecodeError,
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  getOperationDefinition,
  isOperationName,
  parseOperationOutput,
  rpcError,
  rpcOk,
  type RpcRequest,
  type RpcResponse
} from "@zharwing/memory-core";
import { projectStructuredResult } from "@zharwing/memory-privacy";
import type { MemoryService } from "./memory-service.js";
import { requireParams, RpcValidationError } from "./rpc-params.js";
import { createOperationHandlerRegistry } from "./application/operation-handler-registry.js";
import type { AuthorizedInvocation } from "./services/operation-registrar.js";

export type { RpcRequest, RpcResponse } from "@zharwing/memory-core";

const operationHandlers = createOperationHandlerRegistry();

/** Dispatches only an invocation already parsed and admitted by the registrar. */
export async function dispatchAuthorizedRpc(
  service: MemoryService,
  invocation: AuthorizedInvocation
): Promise<RpcResponse> {
  try {
    const input = invocation.input as Record<string, unknown>;
    let result: unknown;
    if (invocation.name === "memory.prepare_destructive_intent") {
      result = service.prepareDestructiveIntent(
        input as { projectId: string; operation: string; input: Record<string, unknown> },
        invocation.principal
      );
    } else if (invocation.name === "memory.commit_destructive_intent") {
      result = await service.commitDestructiveIntent(
        input as { projectId: string; intentId: string; acknowledgement: string },
        invocation.principal,
        (operation, target) => dispatchOperation(service, operation, target)
      );
    } else if (invocation.name === "memory.cancel_destructive_intent") {
      result = service.cancelDestructiveIntent(
        input as { projectId: string; intentId: string },
        invocation.principal
      );
    } else {
      if (getOperationDefinition(invocation.name).effect === "destructive") {
        return rpcError(invocation.requestId, createPublicError("forbidden"));
      }
      result = await dispatchOperation(service, invocation.name, input);
    }
    const decoded = parseOperationOutput(invocation.name, result);
    if (invocation.principal.audience === "provider") {
      if (
        getOperationDefinition(invocation.name).privacyProjection !== "provider" ||
        !invocation.projectId
      ) {
        return rpcError(invocation.requestId, createPublicError("forbidden"));
      }
      const policy = (await service.getProject(invocation.projectId)).privacyPolicy;
      const projected = projectStructuredResult(decoded, {
        principal: invocation.principal,
        projectId: invocation.projectId,
        surface: "provider",
        operation: invocation.name,
        policy,
        profile: "hardened-local",
        limits: {
          maxItems: 100,
          maxBytes: getOperationDefinition(invocation.name).maximumResponseBytes,
          maxDepth: 8
        }
      });
      if (!projected.allowed) {
        return rpcError(invocation.requestId, createPublicError("forbidden"));
      }
      return rpcOk(
        invocation.requestId,
        parseOperationOutput(invocation.name, projected.data)
      );
    }
    return rpcOk(invocation.requestId, decoded);
  } catch (error) {
    return safeDispatchError(invocation.requestId, error);
  }
}

/** Explicit personal-preview compatibility path; hardened HTTP never calls it. */
export async function dispatchRpc(service: MemoryService, request: RpcRequest): Promise<RpcResponse> {
  try {
    if (!request || typeof request.method !== "string") {
      return rpcError(request?.id, createPublicError("validation"));
    }
    if (request.version !== undefined && request.version !== RPC_COMPATIBILITY_VERSION) {
      return rpcError(request.id, createPublicError("compatibility"));
    }
    if (!isOperationName(request.method)) {
      return rpcError(request.id, createPublicError("compatibility"));
    }
    const params = requireParams<Record<string, unknown>>(request.params || {}, request.method);
    const result = await dispatchOperation(service, request.method, params);
    return rpcOk(request.id, parseOperationOutput(request.method, result));
  } catch (error) {
    return safeDispatchError(request?.id, error);
  }
}

function safeDispatchError(
  id: string | number | undefined,
  error: unknown
): RpcResponse {
  // Reduce the exception at the daemon boundary. Nothing from the exception is
  // assigned to the response or to a generic metadata slot.
  const code = error instanceof RpcValidationError || error instanceof ContractDecodeError
    ? "validation"
    : "internal";
  return rpcError(id, createPublicError(code));
}

async function dispatchOperation(
  service: MemoryService,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  if (!isOperationName(method)) throw new RpcValidationError("Unsupported operation.");
  const handler = operationHandlers.get(method);
  if (!handler) throw new RpcValidationError("Unsupported operation.");
  return handler(service, params);
}
