#!/usr/bin/env node
import { serveMcpStdio } from "@aimem/mcp-tools";

// Agent-facing surfaces stay disabled until the privacy facade gate passes.
// Opting in requires an explicit environment flag; the default is refusal.
if (process.env.AIMEM_AGENT_SURFACE !== "enabled") {
  console.error(
    "AGENT_SURFACE_DISABLED: the AI Memory MCP server is disabled until the privacy facade is complete. " +
      "Set AIMEM_AGENT_SURFACE=enabled to opt in."
  );
  process.exit(1);
}

serveMcpStdio();
