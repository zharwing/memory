#!/usr/bin/env node
import { memoryEnv } from "@zharwing/memory-core";
import { serveMcpStdio } from "@zharwing/memory-mcp";

// Agent-facing surfaces require an explicit local opt-in. Once enabled, MCP
// exposes the focused daily memory loop rather than daemon administration.
// The legacy AIMEM_AGENT_SURFACE name stays readable for one transition release.
const agentSurface = memoryEnv("ZHARWING_MEMORY_AGENT_SURFACE");
if (agentSurface !== "enabled") {
  console.error(
    "AGENT_SURFACE_DISABLED: set ZHARWING_MEMORY_AGENT_SURFACE=enabled to allow authenticated AI memory access."
  );
  process.exit(1);
}

if (!process.env.ZHARWING_MEMORY_AGENT_CREDENTIAL?.trim()) {
  console.error(
    "AGENT_CREDENTIAL_REQUIRED: provide a dedicated project-bound agent credential at the trusted host boundary."
  );
  process.exit(1);
}

serveMcpStdio();
