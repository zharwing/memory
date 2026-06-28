export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
    rpcMethod: string;
}
export declare const MEMORY_TOOLS: McpToolDefinition[];
