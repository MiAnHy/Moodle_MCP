# Wayfinder Map: Moodle MCP Server

> **Status**: ACTIVE  
> **Tracker**: Local Markdown Tracker  
> **Last Updated**: 2026-11-18  

## Destination

A production-grade, spec-compliant Moodle Model Context Protocol (MCP) server providing high-signal, token-optimized tools for querying and managing courses, grades, students, and submissions, featuring direct Moodle Web Services connectivity, dual-transport support (stdio & SSE), role-governed authorization, and an automated AI eval test suite.

## Notes

- **Primary Persona**: AI Engineer / MCP Architect.
- **AI Engineering Principles**: Token frugality, semantic compression, deterministic tool contracts, defense-in-depth against prompt injection, and idempotent mutations.
- **Related Assets**: `A:\Projects\Moodle_Agent` (holds the robust Django-based Moodle AI Control Plane with PDP and transactional outbox; evaluate bridging or sharing domain models).
- **Framework Choice**: `@modelcontextprotocol/sdk` (TypeScript/Node) or `FastMCP` (Python).

## Decisions So Far

- [Hardened Stdio Stream Hygiene](file:///a:/Projects/Moodle_MCP/mcp-proxy.js#L48-L167): Established rule that stdio transport must keep `stdout` exclusively for JSON-RPC, routing all diagnostics/logs to `stderr`.

## Frontier (Open Decision Tickets)

### 1. [Architecture] Native MCP Server vs. Thin Gateway Proxy
- **Label**: `wayfinder:task` (HITL)
- **Question**: Should `Moodle_MCP` be re-implemented as a self-contained TypeScript/Node MCP server (using `@modelcontextprotocol/sdk`) that talks directly to Moodle Core REST API (`/webservice/rest/server.php`), or should it bridge to the Python Control Plane in `A:\Projects\Moodle_Agent`?
- **Tradeoffs**:
  - *Option A (Self-contained TS/Node MCP)*: Zero heavy dependencies (no Postgres/Redis required locally), lightning-fast stdio startup for desktop IDEs, portable single package.
  - *Option B (Bridge to Moodle_Agent Python Control Plane)*: Inherits full Policy Decision Point (PDP), audit logging, and transactional outbox, but requires running Django/Postgres services.

### 2. [Transport & Upstream] Decoupling from `local_moodlia` PHP Plugin
- **Label**: `wayfinder:task` (AFK)
- **Question**: Can we bypass `local_moodlia/mcp.php` entirely and call official Moodle Core REST web services (`core_course_get_courses`, `core_enrol_get_enrolled_users`, `gradereport_user_get_grade_items`) directly with standard Moodle tokens?
- **Impact**: Resolves the `-32002 Moodle REST transport failed` blocker, eliminates dependency on third-party PHP plugins, and fixes SSL/cURL loopback errors.

### 3. [AI Engineering] Tool Catalog & Semantic Token Pruning
- **Label**: `wayfinder:research` (AFK)
- **Question**: What are the top 10 high-value Moodle tools required for AI agents, and what transformation pipeline is needed to strip HTML and reduce raw Moodle JSON payloads by 80%+ before returning them to the LLM?
- **Scope**:
  - `moodle_list_courses` (compact list: id, shortname, fullname)
  - `moodle_get_course_summary` (markdown converted from HTML)
  - `moodle_list_enrolled_students` (id, name, email, role)
  - `moodle_get_student_grades` (course total + assignment breakdown)
  - `moodle_get_assignment_submissions` (status, due date, submission text)

### 4. [Security & Human-in-the-Loop] Mutation Safety & Guardrails
- **Label**: `wayfinder:grilling` (HITL)
- **Question**: What policy and verification mechanisms must be enforced before an AI agent can execute state-changing actions (e.g., submitting grades, creating calendar events, unenrolling users)?
- **Mechanism**: Dry-run simulation mode (`preview=true`), explicit parameter bounds checking, and confirmation gates.

### 5. [Observability & Evaluation] AI Evals & Telemetry
- **Label**: `wayfinder:prototype` (HITL)
- **Question**: How do we measure tool-selection precision, argument compliance, token overhead, and latency across different LLMs (Gemini, Claude 3.5 Sonnet, GPT-4o)?

## Not Yet Specified (Fog of War)

- **Vector Search / RAG across Course Materials**: Ingesting syllabus PDFs, lecture slides, and forum discussions into a local embedding store for semantic search via MCP resources.
- **Multi-Tenant / Multi-Campus Routing**: Dynamic endpoint selection when an agent oversees multiple Moodle instances.

## Out of Scope

- Modifying core Moodle PHP source code.
- Building a standalone frontend LMS UI.
