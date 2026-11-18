# 0011. Unified HTTP Transport and Declarative Resource Routing

We decided to consolidate low-level HTTPS stream management and MCP resource provisioning into dedicated deep modules.

## Context & Rationale
1. **Network Layer Asymmetry & DoS Risk**:
   Previously, `MoodleRestClient` and `TokenExchangeService` maintained separate, copy-pasted Node.js HTTPS stream loops. `TokenExchangeService` lacked the 10MB response payload cap present in `MoodleRestClient`, exposing the server to memory exhaustion when communicating with adversarial endpoints.
2. **Resource Routing Calcification**:
   MCP resources were dispatched through ad-hoc regular expression matching and bypassed the `semanticPruner` facade, creating logic leaks.

## Decision
1. **Unified HTTP Transport (`src/moodle/http-transport.ts`)**:
   - Centralize all HTTP form POST communication in a single `postForm<T>` function.
   - Enforce symmetric security invariants across all endpoints: strict pre-flight SSRF validation, CRLF header checks, socket timeout destruction, `isSettled` guard against double-resolution, and a strict 10MB payload size limit.
   - Preserve in-memory password zeroization (`passwordBuffer.fill(0)`) in `TokenExchangeService`.
2. **Declarative Resource Routing (`src/resources/index.ts`)**:
   - Route all resource requests through a declarative route table (`staticRoute` and `templateRoute`).
   - Route all content transformation through the `semanticPruner` facade (`htmlToMarkdown`, `stripSensitiveFields`) to guarantee PII stripping and sanitization consistency.
