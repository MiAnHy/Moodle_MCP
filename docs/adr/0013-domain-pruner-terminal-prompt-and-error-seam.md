# 0013. Domain Semantic Pruner, Terminal Prompt Adapter, and Unified Error Seam

We decided to consolidate domain data projections for deadlines, forum announcements, and course contents behind the `SemanticPruner` facade, encapsulate interactive terminal prompt handling behind a testable `PromptAdapter` seam, and standardize MCP tool error serialization.

## Context & Rationale
1. **Domain Transformation Leakage**:
   Previously, student and teacher tools (`my-deadlines`, `my-submissions`, `course-announcements`, `course-content`) and resource endpoints manually iterated over Moodle entities, duplicated section/module mapping logic, and directly imported low-level transformer helpers.
2. **Terminal Raw Mode & Secret Input Coupling**:
   The interactive `login` command directly bound to Node's `process.stdin` raw mode and TTY events, preventing in-process unit testing and scattering password zeroization.
3. **Disparate MCP Error Payloads**:
   Moodle REST exceptions, SSRF violations, network timeouts, and Zod parameter validation failures were serialized using inconsistent string and JSON shapes across tools and the registry.

## Decision
1. **Domain Semantic Pruner (`src/transformers/index.ts`)**:
   - Expand `SemanticPruner` with `pruneDeadlines()`, `pruneAnnouncements()`, and `pruneCourseContents()`.
   - Guarantee automatic indirect prompt injection defense (`<user_content untrusted="true">`) across all forum announcements.
   - Eliminate duplicate section and module projection loops across `course-content.ts` and `resources/index.ts`.
2. **Terminal Prompt Adapter (`src/cli/prompt.ts`, `src/cli/login.ts`)**:
   - Establish `PromptAdapter` interface with `askText(question)` and `askSecret(question)`.
   - Implement `TerminalPrompt` handling TTY raw mode, character masking (`*`), and backspace erasure.
   - Implement `MockPromptAdapter` allowing fast, deterministic, in-process testing of the CLI login command without physical terminal stream mocks.
3. **Unified MCP Error Serialization Seam (`src/moodle/errors.ts`, `src/tools/registry.ts`)**:
   - Introduce `formatMcpError(error, context)` categorizing errors into `'auth'`, `'network'`, `'validation'`, `'moodle_rest'`, `'security'`, and `'internal'`.
   - Standardize error payloads into structured, machine-readable JSON inside the MCP tool error content block, enabling deterministic client recovery.
