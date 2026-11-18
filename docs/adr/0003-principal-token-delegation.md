# 0003. Principal Identity and Token Delegation

We decided that all Moodle web service operations must execute using the individual user's **Principal Token** rather than a shared master/admin token.

## Context & Rationale
A shared admin token introduces catastrophic security risks: a teacher or student chatting with an AI agent could accidentally access, modify, or delete cross-tenant courses or unauthorized user data.

Delegating authentication to the calling user's principal token offloads authorization directly to Moodle's mature Role-Based Access Control (RBAC) engine. Teachers can only access courses they instruct, students can only see their own grades and submissions, and administrators retain system-wide permissions.
