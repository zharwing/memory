import { AimemClient } from "@aimem/api-client";
import { MEMORY_TOOLS } from "./tools.js";

export interface McpToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export async function dispatchMemoryTool(call: McpToolCall, client = new AimemClient()) {
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) throw new Error(`Unknown memory tool: ${call.name}`);
  const result = await client.call(tool.rpcMethod, call.arguments || {});
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
