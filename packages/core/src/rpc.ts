/**
 * Daemon JSON-RPC envelope. This mirrors the wire shape produced by the
 * daemon's dispatchRpc exactly: {id, ok: true, result} on success and
 * {id, ok: false, error: {message, stack?}} on failure.
 */

export interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcSuccess<T = unknown> {
  id?: string | number;
  ok: true;
  result: T;
}

export interface RpcFailure {
  id?: string | number;
  ok: false;
  error: {
    message: string;
    stack?: string;
  };
}

export type RpcResponse<T = unknown> = RpcSuccess<T> | RpcFailure;

export function rpcOk<T>(id: string | number | undefined, result: T): RpcSuccess<T> {
  return { id, ok: true, result };
}

export function rpcError(id: string | number | undefined, message: string, stack?: string): RpcFailure {
  return { id, ok: false, error: { message, stack } };
}
