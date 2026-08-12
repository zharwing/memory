import {
  ContractDecodeError,
  isOperationName,
  parseOperationInput
} from "@zharwing/memory-core";

export class RpcValidationError extends Error {}

/**
 * Decode every registered operation through the browser-safe core contract
 * authority before parameters reach service code. The single `as T` below is
 * a post-validation narrowing, not an unchecked boundary cast.
 */
export function requireParams<T>(params: Record<string, unknown>, method: string): T {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new RpcValidationError(`RPC params for ${method} must be an object.`);
  }
  if (isOperationName(method)) {
    try {
      return parseOperationInput(method, params) as T;
    } catch (error) {
      if (error instanceof ContractDecodeError) {
        const inputPath = error.path.replace(`${method}.input`, "input");
        const compatibilityPath = error.path.replace(`${method}.input`, "params");
        throw new RpcValidationError(
          `Invalid params for ${method}: ${inputPath} must be ${error.expected}; ` +
          `${compatibilityPath} must be ${error.expected}`
        );
      }
      throw error;
    }
  }
  throw new RpcValidationError(`Unknown RPC operation: ${method}`);
}
