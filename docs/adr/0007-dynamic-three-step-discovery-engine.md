# 0007. Dynamic Three-Step Discovery Engine for 1,000+ Functions

We decided to implement the Dynamic Function Discovery Trio (`moodle_search_functions`, `moodle_describe_function`, `moodle_execute_function`) to give AI agents access to all 1,000+ Moodle Core Web Services without context bloat.

## Context & Rationale
Registering 1,000+ individual MCP tools exhausts LLM context windows (>500k tokens) and severely degrades tool selection accuracy.

Instead, we provide:
1. `moodle_search_functions(query)`: High-speed keyword search over an embedded catalog of all 1,000+ Moodle functions.
2. `moodle_describe_function(function_name)`: On-demand retrieval of exact parameters and return types.
3. `moodle_execute_function(function_name, parameters, dry_run)`: Typed dynamic dispatcher to `/webservice/rest/server.php` with Two-Phase Mutation safeguards.

This achieves 100% functional coverage of Moodle's entire capability surface while consuming less than 1,000 tokens in the baseline tool registry.
