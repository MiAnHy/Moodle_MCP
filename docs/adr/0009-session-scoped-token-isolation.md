# 0009. Session-Scoped Token Isolation for Remote Agents

We decided to enforce session-scoped token isolation for HTTP/SSE transport connections while supporting local credential storage for Stdio transport.

## Context & Rationale
When deploying the Moodle MCP server as a remote SSE service (e.g. for ChatGPT Custom Actions, web applications, or cloud multi-agent swarms), multiple users may connect to the same server process simultaneously.

To prevent cross-tenant data leakage and credential exposure:
1. In `sse` mode, each request/session must supply its own Moodle token via the HTTP `Authorization: Bearer <token>` header or an in-session login handshake.
2. In `stdio` mode, the server reads the local user's configuration from `~/.moodle/auth.json`.
3. In-memory state is strictly partitioned by session ID; no global shared tokens exist across connections.
