import { AgentMemoryClient, type OperationOptions } from "@zharwing/memory-api-client";
import {
  getOperationDefinition,
  isAgentOperationName,
  isOperationName,
  parseOperationInput,
  type AgentOperationName
} from "@zharwing/memory-core";
import {
  deriveMcpCorrelationId,
  deriveMcpMutationIdempotencyKey,
  type JsonRpcRequestId,
  McpProtocolError
} from "./request-identity.js";
import { MEMORY_TOOLS } from "./tools.js";

export interface McpToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpDispatchContext {
  readonly requestId: JsonRpcRequestId;
}

export interface AgentToolClient {
  callAgent(
    method: string,
    input?: Record<string, unknown>,
    options?: OperationOptions
  ): Promise<unknown>;
}

export interface DecodedMemoryToolCall {
  readonly operation: AgentOperationName;
  readonly input: Record<string, unknown>;
}

let defaultAgentClient: AgentMemoryClient | undefined;

export async function dispatchMemoryTool(
  call: McpToolCall,
  context: McpDispatchContext,
  client?: AgentToolClient
) {
  const { operation, input } = decodeMemoryToolCall(call);
  const definition = getOperationDefinition(operation);
  const options: OperationOptions = {
    correlationId: deriveMcpCorrelationId(context.requestId, operation)
  };
  if (definition.idempotency === "required") {
    options.idempotencyKey = deriveMcpMutationIdempotencyKey(context.requestId, operation);
  }
  // Stdio MCP is an agent surface: every call goes through the daemon's
  // audience-checked facade endpoint, never the control-plane /rpc.
  const result = await (client ?? defaultClient()).callAgent(operation, input, options);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

/** Shared exact decoder for both the daemon-hosted HTTP MCP and stdio hop. */
export function decodeMemoryToolCall(call: McpToolCall): DecodedMemoryToolCall {
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool || !isOperationName(tool.rpcMethod) || !isAgentOperationName(tool.rpcMethod)) {
    throw new McpProtocolError("method-not-found", "Unknown memory tool.");
  }
  const operation = tool.rpcMethod as AgentOperationName;
  let input: Record<string, unknown>;
  try {
    const presentedInput = call.arguments ?? {};
    const advertisedFields = new Set(Object.keys(tool.inputSchema.properties));
    if (Object.keys(presentedInput).some((field) => !advertisedFields.has(field))) {
      throw new Error("unadvertised tool input");
    }
    input = parseOperationInput(operation, presentedInput) as Record<string, unknown>;
  } catch {
    throw new McpProtocolError("invalid-params", "The tool arguments are not valid.");
  }
  return { operation, input };
}

function defaultClient(): AgentMemoryClient {
  // Construct lazily at the first tool call so list/initialize remain usable
  // for diagnostics, but consult only the dedicated trusted-host agent input.
  defaultAgentClient ??= new AgentMemoryClient();
  return defaultAgentClient;
}
