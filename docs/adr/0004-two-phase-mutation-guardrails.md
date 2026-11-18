# 0004. Two-Phase Mutation Guardrails

We decided that all state-changing Moodle operations (create, update, delete, submit) must enforce a **Two-Phase Mutation** pattern.

## Context & Rationale
Autonomous AI agents are prone to hallucinations or misunderstandings that can corrupt database state (e.g. bulk deleting enrolled students, overwriting final exam grades).

To prevent accidental data loss:
1. Every mutation tool runs in `dry_run: true` mode by default.
2. The response returns an execution plan detailing the exact records and fields to be modified.
3. The AI agent must present this plan to the user in chat and obtain explicit approval before re-invoking the tool with `confirm: true`.

## Implementation Seam
Enforced canonically via `executeMutatingTool` in `src/tools/mutation-guard.ts`. Tool modules only provide a diff preview callback and write execution callback, guaranteeing consistent status reporting and eliminating copy-paste guard bypasses.
