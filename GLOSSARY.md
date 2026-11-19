# Moodle MCP Domain Glossary

The canonical domain model and language for the universal Moodle Model Context Protocol (MCP) server.

## Core Domain Concepts

**Moodle Connector**:
A spec-compliant Model Context Protocol server that translates LLM intent into typed, authenticated Moodle Core Web Service calls.  
_Avoid_: Proxy, relay, bot, plugin scraper

**Role Profile**:
A curated, role-scoped subset of MCP tools exposed to an agent (`student`, `teacher`, `admin`) to prevent context window bloat and tool selection degradation.  
_Avoid_: Tool dump, full catalog

**Student Profile**:
A dedicated role profile giving students safe access to their enrolled courses, assignment deadlines, submission statuses, feedback, grades, and forum announcements.  
_Avoid_: Learner bot, student portal

**Dynamic Function Discovery**:
A three-step introspection meta-pattern (`search_functions`, `describe_function`, `execute_function`) that grants full on-demand access to all 1,000+ Moodle Core Web Services without preloading their schemas into client context.  
_Avoid_: Static tool dump, hardcoded schema list

**Token Exchange Service**:
The authentication flow that accepts user Moodle credentials (username and password) and exchanges them with Moodle's native `/login/token.php` endpoint to obtain a scoped Principal Token.  
_Avoid_: Password scraping, web session cookies

**Semantic Pruner**:
The transformation engine that strips CMS metadata, Behat flags, and converts verbose Moodle HTML into compact Markdown for token-efficient LLM consumption.  
_Avoid_: Raw parser, JSON filter

**Two-Phase Mutation**:
A safety pattern where any state-changing action returns a simulated preview (`dry_run: true`) until explicitly executed with user confirmation (`confirm: true`).  
_Avoid_: Blind execution, autonomous write

**Two-Phase Mutation Guard**:
The canonical higher-order module (`executeMutatingTool`) enforcing the preview-before-commit invariant across all state-altering tools at a single execution seam.  
_Avoid_: Manual guard checks, per-tool branching

**Unified HTTP Transport**:
The consolidated network dispatch module (`postForm`) enforcing symmetric SSRF validation, payload byte bounds, and socket timeout lifecycles for all Moodle Core REST and Token Exchange requests.  
_Avoid_: Ad-hoc https loops, unbuffered streams

**Principal Token**:
The Moodle Web Service token belonging to the specific student, teacher, or administrator driving the AI session, ensuring native Moodle capability enforcement.  
_Avoid_: God token, universal secret, master key

**Untrusted Data Tagging**:
A prompt-injection defense pattern where external user-generated content (student essays, forum posts) is wrapped in inert tags (`<user_content untrusted="true">`) to prevent model instruction hijacking.  
_Avoid_: Raw string interpolation, untrusted prompt injection

**SSRF Guardrail**:
Network boundary enforcement preventing the connector from dispatching requests to cloud metadata services or unapproved internal network endpoints.  
_Avoid_: Unchecked URL routing

**Socket Resolution Seam**:
The post-resolution hook (`createSecureLookup`) that intercepts IP addresses resolved by DNS before TCP connection establishment, preventing DNS rebinding to cloud metadata or internal subnets.  
_Avoid_: Pre-flight string only check

**Tool Registry**:
The deep module (`ToolRegistry`) that indexes tools by name in $O(1)$ maps, precomputes MCP JSON Schemas at startup, and encapsulates parameter parsing, profile authorization, and execution dispatch behind a two-method interface.  
_Avoid_: Dynamic schema mapper, linear tool searcher

**SSE Engine**:
The decoupled multi-tenant Server-Sent Events transport module (`createSseEngine`) isolating HTTP routes, session-scoped token authorization, and inactive session pruning from the CLI process lifecycle.  
_Avoid_: Inline Express script, monolithic CLI server

**Terminal Prompt Adapter**:
The terminal input abstraction (`PromptAdapter`, `TerminalPrompt`) that encapsulates Node readline interfaces, raw TTY event listening, password masking, and memory zeroization behind a two-method interface.  
_Avoid_: Ad-hoc readline scripts, scattered TTY mode toggles

**Error Serialization Seam**:
The centralized error formatting function (`formatMcpError`) converting Moodle REST errors, network timeouts, SSRF blocks, and Zod parameter validation failures into standardized, machine-readable MCP tool error payloads.  
_Avoid_: Inconsistent error strings, unformatted stack traces

**Cockpit Telemetry Frontend**:
The scroll-driven, zero-dependency web interface built upon ScrollCraft scrollytelling grammar, presenting live protocol execution telemetry, role profile toolkits, and interactive safety latch simulations.  
_Avoid_: Passive brochure, marketing landing page, diorama site

**Dual-Transport Inspector**:
The bespoke signature interaction component allowing visitors to toggle between local Stdio and remote SSE transports, inspecting simulated JSON-RPC wire frames, token delegation headers, and security invariants in real time.  
_Avoid_: Static code snippet, screenshot comparison

