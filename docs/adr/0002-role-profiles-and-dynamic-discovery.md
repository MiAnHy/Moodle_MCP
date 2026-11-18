# 0002. Role Profiles and Dynamic Web Service Discovery

We decided to partition Moodle's 1,000+ web service functions into curated **Role Profiles** (`student`, `teacher`, `admin`) combined with a **Dynamic Function Discovery** engine (`search`, `describe`, `execute`).

## Context & Rationale
Registering 1,000+ tools directly into the MCP `tools/list` exceeds client context budgets, inflates token costs, and severely degrades LLM tool-calling accuracy. 

Instead:
1. Each session activates an ergonomic, role-based subset of high-frequency tools (<20 tools).
2. Advanced or rarely-used functions from Moodle's 1,000+ catalog are accessed via dynamic introspection tools (`moodle_search_functions`, `moodle_describe_function`, `moodle_execute_function`), giving complete access to all Moodle capabilities on demand with zero token waste.
