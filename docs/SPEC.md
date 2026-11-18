# Moodle MCP Server Specification

> **Specification Authority**: Created via `/to-spec` following `/grill-with-docs`  
> **Status**: Ready for Implementation (`ready-for-agent`)  
> **ADR References**: [docs/adr/0001-0009](file:///a:/Projects/Moodle_MCP/docs/adr/)  
> **Domain Glossary**: [GLOSSARY.md](file:///a:/Projects/Moodle_MCP/GLOSSARY.md)  

---

## Problem Statement

Educational institutions, teachers, students, and system administrators want to leverage modern AI agents (ChatGPT, Claude Desktop, Cursor, Antigravity, OpenAI Codex) to interact seamlessly with their Moodle Learning Management System (LMS). 

However, existing approaches suffer from four critical failures:
1. **Fragile, Broken Relays**: Relying on unmaintained local PHP plugins (like `local_moodlia/mcp.php`) causes internal cURL transport rejections, expired SSL handshake failures, and unhelpful JSON-RPC `-32002` errors.
2. **Context Bloat & Token Exhaustion**: Moodle's native APIs dump massive, raw CMS payloads containing verbose HTML tags (`<p>`, `<span>`, inline CSS), database timestamps, and Behat test flags. This quickly exhausts LLM context windows (>150k tokens) and makes agents hallucinate.
3. **The 1,000+ Function Dilemma**: Moodle has over a thousand web service functions. Pre-registering 1,000 tools directly into an MCP catalog crashes client tool-selection algorithms, while exposing only 5 hardcoded tools limits the user's control over the platform.
4. **Dangerous Mutations & Authorization Gaps**: Autonomous agents with write access risk making catastrophic mistakes (e.g. bulk deleting enrolled students, overwriting final exam grades) without human verification, while using a single admin "God token" exposes confidential student data.

---

## Solution

Build a production-grade, zero-dependency, dual-transport **Moodle Model Context Protocol (MCP) Server** in TypeScript (`@modelcontextprotocol/sdk`) that:
1. **Bypasses intermediaries**: Connects directly to Moodle's native Core REST API (`/webservice/rest/server.php`) and Token Exchange (`/login/token.php`).
2. **Native Username/Password Login**: Allows users to log in directly with their standard Moodle credentials (`npx moodle-mcp login`), eliminating the need to manually generate and copy 32-character tokens.
3. **Role-Based Profiles**: Provides curated high-signal profiles (`student`, `teacher`, `admin`) with fewer than 20 active tools to preserve the model's "smart zone".
4. **Dynamic Discovery Trio**: Exposes `moodle_search_functions`, `moodle_describe_function`, and `moodle_execute_function` to grant on-demand access to all 1,000+ Moodle Core Web Services without context bloat.
5. **Semantic Token Pruning**: Strips internal CMS metadata and converts raw HTML into minimal Markdown, reducing token overhead by >80%.
6. **Two-Phase Mutation Guardrails**: Requires a preview diff (`dry_run: true`) and explicit user confirmation (`confirm: true`) for all state-changing operations.
7. **Universal Dual-Transport**: Operates out of the box over `stdio` (local IDEs) and Streamable HTTP/SSE (remote ChatGPT Actions / cloud web agents).
8. **Bundled Agent Skills**: Ships with ready-to-use Agent Skills for student tutoring, automated grading, syllabus design, and administrative operations.

---

## User Stories

### Student Persona
1. As a student, I want to log in with my Moodle username and password, so that the AI assistant can access my specific courses without requiring manual token setup.
2. As a student, I want to ask "What assignments and quizzes do I have due this week?", so that I never miss an academic deadline.
3. As a student, I want to fetch my course syllabus, lecture slides, and reading materials in clean Markdown, so that I can study and ask the AI questions about the content.
4. As a student, I want to check my grades, rubric scores, and instructor feedback, so that I understand where I need to improve.
5. As a student, I want to verify whether my assignment submission was received and whether it is marked as a draft or final submission.
6. As a student, I want to read course announcements and forum posts, so that I stay up to date on changes made by my instructors.
7. As a student, I want the system to ensure I cannot view other students' grades, submissions, or administrative settings.

### Teacher Persona
8. As a teacher, I want to view a compact list of all the courses I instruct, so that I can direct the AI to work on a specific class.
9. As a teacher, I want to view all enrolled students in my course along with their email addresses and roles.
10. As a teacher, I want to inspect all student submissions for an assignment, including submission timestamps and text.
11. As a teacher, I want the AI to review a student's submission against an assignment rubric and draft proposed grades and constructive feedback.
12. As a teacher, I want the MCP server to show me a dry-run preview before publishing any grades to Moodle, so that I can verify the evaluation before committing it.
13. As a teacher, I want to publish grades and feedback to Moodle once I confirm the preview in chat.
14. As a teacher, I want to create new course sections, announcements, and assignment stubs directly through natural language conversations.

### Administrator Persona
15. As an administrator, I want to query Moodle system information, version, release status, and active site plugins.
16. As an administrator, I want to search and filter through site-wide user accounts by username, email, or authentication method.
17. As an administrator, I want to create, update, or suspend user accounts with a mandatory dry-run confirmation step.
18. As an administrator, I want to create new courses, assign course categories, and enroll instructors into cohorts.
19. As an administrator, I want to discover and execute any of Moodle's 1,000+ native web service functions by searching for keywords (e.g. "backup", "badge", "cohort") and executing them dynamically with parameters.

### AI Client & Developer Persona
20. As a developer using Claude Desktop, Cursor, or Antigravity, I want to launch the server locally via `stdio` using `npx moodle-mcp`, so that setup takes under 30 seconds.
21. As a developer deploying for ChatGPT Custom Actions, I want to launch the server via `--transport sse --port 3000`, so that remote web clients can connect securely.
22. As an AI system architect, I want every state mutation to follow two-phase preview verification, so that the AI cannot cause accidental data destruction.
23. As an LLM reasoning engine, I want Moodle API responses stripped of HTML junk and CMS metadata, so that I can stay within the 150k token smart zone.

---

## Implementation Decisions

1. **Language & Runtime**: Node.js v20+ / TypeScript 5.x using `@modelcontextprotocol/sdk` (v1.x) and `zod` for declarative schema validation.
2. **Architecture**: Clean decoupled layers:
   - `MoodleClient`: Direct HTTPS communication with Moodle Core REST API (`/webservice/rest/server.php`) and Login Token Exchange (`/login/token.php`).
   - `SemanticPruner`: Turndown-based HTML-to-Markdown engine and field projection filters.
   - `ToolRegistry`: Role-scoped profiles (`student`, `teacher`, `admin`) plus the `Dynamic Discovery Trio`.
   - `TransportLayer`: Dual-transport adapter supporting `StdioServerTransport` and `SSEServerTransport`.
3. **Authentication Strategy**:
   - `stdio` mode: Reads configuration from local user profile (`~/.moodle/auth.json`) populated via `npx moodle-mcp login` or environment variables (`MOODLE_URL`, `MOODLE_TOKEN`).
   - `sse` mode: Session-isolated authentication extracted from the HTTP `Authorization: Bearer <token>` header.
4. **Dynamic Discovery Trio**:
   - Pre-compiled index of Moodle Core Web Services containing function names, descriptions, and components.
   - Dynamic parameter introspection and dispatch to `/webservice/rest/server.php`.
5. **Mutation Safeguard**:
   - Tools accept `dry_run: boolean` (default: `true`) and `confirm: boolean` (default: `false`).
   - When `dry_run` is true, the tool returns the compiled diff without making database mutations.
   - When `confirm` is true, the tool executes the mutation and returns the authoritative state.

---

## Testing Decisions

1. **Highest Seam Testing**: Tests must interact through the external boundaries: the MCP protocol layer and Moodle client contract, rather than mocking private utility functions.
2. **In-Memory Mock Moodle Runtime**: A high-fidelity mock implementation of Moodle's REST endpoints for offline CI/CD, fast local unit testing, and TDD.
3. **Contract Verification**:
   - Verification that HTML payloads are stripped and compressed by >75%.
   - Verification that two-phase mutations reject unconfirmed execution.
   - Verification of role-fencing between student and teacher profiles.

---

## Out of Scope

- Modifying core Moodle PHP source code.
- Building a standalone frontend web dashboard.
- Direct database (SQL) access to Moodle PostgreSQL/MySQL tables (all access must strictly respect Moodle's Web Service API layer).

---

## Further Notes

- Target Moodle versions: Moodle 4.1 LTS through Moodle 5.2+.
- Package distribution: Available via `npx moodle-mcp` or Docker container.
