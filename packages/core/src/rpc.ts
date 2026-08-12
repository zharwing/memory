import {
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  isPublicError,
  type PublicError
} from "./contracts/index.js";

/** Versioned daemon RPC envelope shared by every carrier. */
export interface RpcRequest {
  version?: number;
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcSuccess<T = unknown> {
  version?: typeof RPC_COMPATIBILITY_VERSION;
  id?: string | number;
  ok: true;
  result: T;
}

/**
 * The only serializable failure shape. In particular there is no `message`,
 * `stack`, `cause`, path, or arbitrary metadata slot. User copy is selected by
 * `messageId` at the trusted UI boundary.
 */
export interface RpcFailure {
  version?: typeof RPC_COMPATIBILITY_VERSION;
  id?: string | number;
  ok: false;
  error: PublicError;
}

export type RpcResponse<T = unknown> = RpcSuccess<T> | RpcFailure;

export function rpcOk<T>(id: string | number | undefined, result: T): RpcSuccess<T> {
  return { version: RPC_COMPATIBILITY_VERSION, id, ok: true, result };
}

export function rpcError(
  id: string | number | undefined,
  error: PublicError
): RpcFailure {
  const safeError = isPublicError(error) ? error : createPublicError("internal");
  return {
    version: RPC_COMPATIBILITY_VERSION,
    id,
    ok: false,
    error: safeError
  };
}
