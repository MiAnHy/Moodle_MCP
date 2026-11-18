# 0012. Socket Resolution Seam, Deep Tool Registry, and Decoupled SSE Engine

We decided to intercept address resolution at the socket creation seam, consolidate tool schema management behind a deep ToolRegistry module, wire dynamic discovery directly through the mutation guard, and decouple multi-tenant SSE transport into an isolated engine.

## Context & Rationale
1. **DNS Rebinding Vulnerability (TOCTOU SSRF)**:
   Pre-flight URL validation checks hostnames before socket connection. In adversarial setups, an attacker-controlled domain can resolve to a public IP at pre-flight check time, and then resolve to an internal link-local IP (`169.254.169.254` AWS/GCP metadata or `100.100.100.200` Alibaba metadata) during Node's socket connection, bypassing pre-flight SSRF protection.
2. **Runtime Tool Listing Overhead & Schema Coupling**:
   The MCP server re-ran `zodToJsonSchema` dynamically on every protocol request and used linear array searching to execute tools, leaking schema scrubbing and parameter parsing into the server runtime.
3. **Dynamic Discovery Invariant Divergence**:
   While static mutating tools were consolidated behind `executeMutatingTool` (ADR-0004), `moodle_execute_function` used an ad-hoc dry-run check and bespoke preview diff structure.
4. **SSE Session Coupling**:
   Express HTTP routes, SSE multi-tenant session maps, and authorization parsing were coupled inside `src/cli/index.ts`, preventing automated in-process testing.

## Decision
1. **Socket Resolution Seam (`src/security/ssrf.ts`, `src/moodle/http-transport.ts`)**:
   - Introduce `createSecureLookup()` attaching directly to Node's `http`/`https.request` `lookup` hook.
   - Post-resolution IP addresses are strictly checked against `isCloudMetadataIpv4` and `isPrivateIp`.
   - Cloud metadata addresses (`169.254.169.254`, `100.100.100.200`, `metadata.google.internal`) are blocked unconditionally before TCP socket handshake.
2. **Deep Tool Registry & Schema Cache (`src/tools/registry.ts`, `src/server.ts`)**:
   - Introduce `ToolRegistry` indexing tools by name in $O(1)$ `Map` structures and pre-computing MCP JSON Schemas at initialization.
   - `server.ts` delegates `tools/list` to `registry.getMcpToolsForProfile(profile)` and `tools/call` to `registry.dispatchTool(name, args, ctx, profile)`.
3. **Dynamic Discovery Mutation Guard Dispatch (`src/tools/discovery/execute-function.ts`)**:
   - Delegate state-altering dynamic web service calls directly to `executeMutatingTool` (ADR-0004), providing uniform `PENDING_HUMAN_CONFIRMATION` previews and two-phase commits across all 1,000+ Moodle Core functions.
4. **Decoupled Multi-Tenant SSE Engine (`src/transport/sse-engine.ts`, `src/cli/index.ts`)**:
   - Isolate Express app setup, `/health`, `/sse`, and `/messages` routing, session-scoped token extraction (ADR-0009), and 30-minute idle session pruning into `createSseEngine()`.
   - `src/cli/index.ts` is reduced to pure CLI argument parsing and process lifecycle.
