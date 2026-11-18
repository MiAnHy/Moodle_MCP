# 0005. Bundled Native Agent Skills

We decided to package the MCP server repository with pre-built, production-ready Agent Skills and System Prompts for teachers, students, and administrators.

## Context & Rationale
An MCP server provides raw tools, but an LLM requires domain-specific instructions, reasoning chains, and few-shot examples to orchestrate complex educational workflows reliably.

We bundle standardized Agent Skills (e.g. `moodle-student-tutor`, `moodle-grading-assistant`, `moodle-course-designer`, `moodle-admin-ops`) that can be loaded into Antigravity, Claude Code, Cursor, or ChatGPT to guide the agent seamlessly.
