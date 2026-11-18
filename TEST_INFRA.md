# E2E Test Infra: Universal Moodle MCP Server

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: The test suite exercises the server strictly from the perspective of an external LLM agent / MCP client and HTTP/REST consumer, derived entirely from `ORIGINAL_REQUEST.md`, `docs/SPEC.md`, and `PROJECT.md § Feature Inventory`.
- **Zero Internal Coupling**: Tests interact exclusively via public MCP JSON-RPC protocol tools/resources and direct Moodle network contracts. No private functions or internal helpers are directly imported or mocked in test assertions.
- **Progressive Testability**: Verification does not presuppose complex downstream features. Tests progress logically from foundational transport contracts (Tier 1) through security boundaries (Tier 2), interaction pairs (Tier 3), and complex workflows (Tier 4).
- **Design Methodology**: 
  - *Tier 1*: Category-Partition Equivalence Class Testing (≥5 tests per feature).
  - *Tier 2*: Boundary Value Analysis & Negative Security Testing (≥5 tests per feature with boundary conditions: empty inputs, 10MB payload bounds, CRLF header injection, SSRF private IP & metadata filtering, 30s timeouts, invalid authentication, two-phase mutation unconfirmed rejection).
  - *Tier 3*: Pairwise Combinatorial Testing covering major feature handoffs and state transitions.
  - *Tier 4*: Real-World Workload Testing simulating actual multi-turn educational workflows (Student Revision, Teacher Grading, Admin Provisioning, Dynamic Discovery).

---

## Feature Inventory Coverage Map

| # | Feature | Requirement Source | Tier 1 (Equiv.) | Tier 2 (Boundaries) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:---------------:|:-------------------:|:-----------------:|:-----------------:|
| 1 | Direct REST Transport | ORIGINAL_REQUEST § R1, SPEC line 25 | 5 | 5 | ✓ | S1, S2, S3 |
| 2 | Token Login Exchange | ORIGINAL_REQUEST § R1, ADR 0006 | 5 | 5 | ✓ | S1, S2, S3 |
| 3 | SSRF Guardrail | ORIGINAL_REQUEST § R1, ADR 0010 | 5 | 5 | ✓ | S1, S3 |
| 4 | CRLF Header Defense | ORIGINAL_REQUEST § R1, Ticket 01 | 5 | 5 | ✓ | S1, S2 |
| 5 | Payload & Socket Bounds | ORIGINAL_REQUEST § R1, Ticket 01 | 5 | 5 | ✓ | S1, S2 |
| 6 | Mock Moodle Client | ORIGINAL_REQUEST § R1, SPEC line 26 | 5 | 5 | ✓ | S1, S2, S3, S4 |
| 7 | HTML to Markdown | ORIGINAL_REQUEST § R2, ADR 0010 | 5 | 5 | ✓ | S1, S2 |
| 8 | Context Frugality Pipeline | ORIGINAL_REQUEST § R2, SPEC line 29 | 5 | 5 | ✓ | S1, S2 |
| 9 | Untrusted Data Tagging | ORIGINAL_REQUEST § R2, ADR 0010 | 5 | 5 | ✓ | S1, S2 |
| 10 | PII / Hash Stripping | ORIGINAL_REQUEST § R2, ADR 0010 | 5 | 5 | ✓ | S1, S3 |
| 11 | `moodle_my_courses` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 12 | `moodle_my_deadlines` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 13 | `moodle_get_course_content` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 14 | `moodle_my_grades` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 15 | `moodle_my_submissions` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 16 | `moodle_course_announcements` | ORIGINAL_REQUEST § R3, Ticket 03 | 5 | 5 | ✓ | S1 |
| 17 | `moodle://courses/{id}/syllabus` | ORIGINAL_REQUEST § R3, SPEC line 77 | 5 | 5 | ✓ | S1 |
| 18 | `moodle_list_teacher_courses` | ORIGINAL_REQUEST § R4, SPEC line 48 | 5 | 5 | ✓ | S2 |
| 19 | `moodle_get_enrolled_students` | ORIGINAL_REQUEST § R4, SPEC line 49 | 5 | 5 | ✓ | S2 |
| 20 | `moodle_get_assignment_submissions` | ORIGINAL_REQUEST § R4, ADR 0010 | 5 | 5 | ✓ | S2 |
| 21 | `moodle_submit_grade` | ORIGINAL_REQUEST § R4, ADR 0004 | 5 | 5 | ✓ | S2 |
| 22 | `moodle_post_announcement` | ORIGINAL_REQUEST § R4, Ticket 04 | 5 | 5 | ✓ | S2 |
| 23 | `moodle_get_site_info` | ORIGINAL_REQUEST § R5, SPEC line 57 | 5 | 5 | ✓ | S3 |
| 24 | `moodle_search_users` | ORIGINAL_REQUEST § R5, SPEC line 58 | 5 | 5 | ✓ | S3 |
| 25 | `moodle_create_user` | ORIGINAL_REQUEST § R5, ADR 0004 | 5 | 5 | ✓ | S3 |
| 26 | `moodle_create_course` | ORIGINAL_REQUEST § R5, ADR 0004 | 5 | 5 | ✓ | S3 |
| 27 | `moodle_enrol_user` | ORIGINAL_REQUEST § R5, ADR 0004 | 5 | 5 | ✓ | S3 |
| 28 | `moodle_search_functions` | ORIGINAL_REQUEST § R6, ADR 0007 | 5 | 5 | ✓ | S4 |
| 29 | `moodle_describe_function` | ORIGINAL_REQUEST § R6, ADR 0007 | 5 | 5 | ✓ | S4 |
| 30 | `moodle_execute_function` | ORIGINAL_REQUEST § R6, ADR 0007 | 5 | 5 | ✓ | S4 |
| 31 | Stdio Transport Runtime | ORIGINAL_REQUEST § R7, ADR 0001 | 5 | 5 | ✓ | S1, S2, S3, S4 |
| 32 | SSE Transport Runtime | ORIGINAL_REQUEST § R7, ADR 0009 | 5 | 5 | ✓ | S1, S2, S3, S4 |
| 33 | CLI `moodle-mcp login` | ORIGINAL_REQUEST § R7, ADR 0006 | 5 | 5 | ✓ | S1, S2, S3 |
| 34 | Role-Based Profile Filter | ORIGINAL_REQUEST § R7, ADR 0002 | 5 | 5 | ✓ | S1, S2, S3 |
| 35 | Bundled Agent Skills | ORIGINAL_REQUEST § R8, ADR 0005 | 5 | 5 | ✓ | S1, S2, S3, S4 |
| 36 | Full E2E Test Suite Pass | ORIGINAL_REQUEST § R9, Acceptance | ✓ | ✓ | ✓ | All |

---

## Test Architecture

### Directory Layout
```
tests/
├── e2e/
│   ├── harness/
│   │   ├── mcp-test-client.ts        # Opaque-box MCP client wrapping stdio / memory transport
│   │   ├── mock-moodle-server.ts     # Configurable Mock Moodle HTTP REST & Token server
│   │   └── fixture-loader.ts         # High-fidelity fixture provider
│   ├── tier1-feature-coverage/
│   │   ├── core-transport.test.ts    # Features 1-6
│   │   ├── semantic-pruning.test.ts  # Features 7-10
│   │   ├── student-profile.test.ts   # Features 11-17
│   │   ├── teacher-profile.test.ts   # Features 18-22
│   │   ├── admin-profile.test.ts     # Features 23-27
│   │   ├── dynamic-discovery.test.ts # Features 28-30
│   │   └── server-transports.test.ts # Features 31-35
│   ├── tier2-boundaries/
│   │   ├── security-ssrf.test.ts     # SSRF, metadata 169.254.169.254, RFC 1918
│   │   ├── security-crlf.test.ts     # Header injection, CRLF [\r\n] in tokens/headers
│   │   ├── bounds-and-limits.test.ts # 10MB limits, 30s socket timeouts, empty bodies
│   │   ├── injection-fencing.test.ts # Prompt injection quarantine in user content
│   │   └── mutation-guardrails.test.ts # Two-phase mutation dry-run rejection
│   ├── tier3-combinations/
│   │   ├── auth-to-query-pairwise.test.ts
│   │   ├── query-to-mutation-pairwise.test.ts
│   │   └── profile-boundary-pairwise.test.ts
│   └── tier4-workloads/
│       ├── student-revision-workflow.test.ts
│       ├── teacher-rubric-grading-workflow.test.ts
│       ├── admin-provisioning-workflow.test.ts
│       └── dynamic-discovery-workflow.test.ts
```

### Test Invocation & Semantics
- Runner command: `npm test` or `npx vitest run tests/e2e`
- Exit Code: `0` for all passing tests.
- Execution Environment: Pure TypeScript / Node.js with local in-memory Mock Moodle Server, requiring zero external internet access and zero real Moodle instance dependencies.

---

## Real-World Application Scenarios (Tier 4)

### Scenario 1: Student Revision & Course Discovery Workflow
- **Steps**:
  1. Student authenticates via `login` token exchange.
  2. Queries `moodle_my_courses` to retrieve enrolled courses.
  3. Queries `moodle_my_deadlines` to identify upcoming assignments.
  4. Reads `moodle://courses/{id}/syllabus` passive MCP resource and calls `moodle_get_course_content` to review lecture notes.
  5. Inspects `moodle_my_grades` and `moodle_my_submissions` to verify assignment completion status.
  6. Reads `moodle_course_announcements` with untrusted data fence verification.

### Scenario 2: Teacher Rubric Grading & Two-Phase Mutation Workflow
- **Steps**:
  1. Teacher authenticates and lists courses instructed via `moodle_list_teacher_courses`.
  2. Queries enrolled students via `moodle_get_enrolled_students`.
  3. Fetches submitted student attempts with `moodle_get_assignment_submissions` (verifying `<user_content untrusted="true">` fencing around student text).
  4. Submits rubric evaluation with `dry_run: true` (`moodle_submit_grade`) -> verifies preview diff returned, no mutation applied.
  5. Submits confirmed grade with `confirm: true` -> verifies grade committed and state updated.
  6. Posts assignment clarification via `moodle_post_announcement` (verifying preview then commit).

### Scenario 3: Administrator Provisioning & Governance Workflow
- **Steps**:
  1. Admin authenticates and queries `moodle_get_site_info` (site version, release status).
  2. Searches existing users via `moodle_search_users`.
  3. Provisions new student account via `moodle_create_user` (two-phase: preview diff verified, then confirmed).
  4. Creates new course via `moodle_create_course` (two-phase).
  5. Enrolls user into newly created course via `moodle_enrol_user` (two-phase).
  6. Verifies privacy controls: internal password hashes and salts are completely stripped from all returned user objects.

### Scenario 4: Dynamic Function Discovery & Introspection Workflow
- **Steps**:
  1. Client searches for capabilities via `moodle_search_functions(query="cohort")`.
  2. Introspects parameter requirements and schemas via `moodle_describe_function(function_name="core_cohort_get_cohorts")`.
  3. Dynamically invokes the web service via `moodle_execute_function` with parameters, verifying execution allowlist enforcement and response serialization.

---

## Coverage Thresholds & Success Criteria
- **Tier 1**: ≥5 distinct test cases per core feature across all profiles (total ≥ 175 tests).
- **Tier 2**: ≥5 boundary, negative, and security tests per boundary dimension (empty, 10MB bounds, CRLF, SSRF, 30s timeout, invalid auth, mutation refusal) (total ≥ 50 tests).
- **Tier 3**: Pairwise coverage of all major feature handoffs and profile transitions (total ≥ 25 tests).
- **Tier 4**: 4 complete end-to-end multi-turn workflows (total ≥ 20 scenarios/steps).
- **Grand Total**: ≥ 270 comprehensive E2E test cases passing with exit code 0.
