import { AimemClient } from "@aimem/api-client";
export interface McpToolCall {
    name: string;
    arguments?: Record<string, unknown>;
}
export declare function dispatchMemoryTool(call: McpToolCall, client?: AimemClient): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
