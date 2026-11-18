# 0001. Universal Dual-Transport Distribution

We decided to build the Moodle MCP server as a standalone, zero-dependency TypeScript package supporting both standard I/O (`stdio`) and Server-Sent Events (`sse`).

## Context & Rationale
MCP clients fall into two categories:
1. Local desktop tools (Claude Desktop, Cursor, Antigravity, OpenAI Codex CLI) that spawn MCP servers as child processes communicating over `stdio`.
2. Remote and web-based agents (ChatGPT Actions, web-hosted AI workers, cloud orchestration engines) that connect over HTTP/SSE.

Building dual-transport into a single codebase ensures universal distribution: a single command (`npx moodle-mcp`) can run locally via stdio or start an HTTP/SSE server (`--transport sse --port 3000`) for cloud agents.
