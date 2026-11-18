# 0006. Direct Moodle Login Exchange

We decided to support automated credential exchange via Moodle's native `/login/token.php` endpoint.

## Context & Rationale
Requiring teachers, students, and administrators to manually generate and copy 32-character web service tokens from Moodle settings is a major barrier to adoption.

We provide a direct login flow (`npx moodle-mcp login` and `moodle_login` tool) that exchanges username and password against `POST /login/token.php?service=moodle_mobile_app` for a scoped web service token. Passwords are never persisted or echoed in logs; only the resulting token is saved to the local secure configuration.
