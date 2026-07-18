#!/usr/bin/env node
import { serveMcpStdio } from "@zharwing/memory-mcp";

// Agent-facing surfaces stay disabled until the privacy facade gate passes.
// Opting in requires an explicit environment flag; the default is refusal.
// The legacy AIMEM_AGENT_SURFACE name stays readable for one transition release.
const agentSurface = process.env.ZHARWING_MEMORY_AGENT_SURFACE ?? process.env.AIMEM_AGENT_SURFACE;
if (agentSurface !== "enabled") {
  console.error(
    "AGENT_SURFACE_DISABLED: the Zharwing Memory MCP server is disabled until the privacy facade is complete. " +
      "Set ZHARWING_MEMORY_AGENT_SURFACE=enabled to opt in."
  );
  process.exit(1);
}

serveMcpStdio();
