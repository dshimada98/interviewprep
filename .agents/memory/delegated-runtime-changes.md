---
name: Delegated runtime changes
description: Avoid unrelated runtime additions during frontend-only work.
---

Inspect runtime configuration changes after frontend design delegation; do not keep newly added toolchains unless the product needs them.

**Why:** Frontend-only delegation has repeatedly introduced an unrequested Python runtime into this Node/PostgreSQL project, even when the requested UI did not require Python.

**How to apply:** Ask helpers to avoid Python commands for frontend-only changes. Compare `.replit` with its starting state after delegation. Remove only confirmed unneeded additions using the package-management tooling; preserve existing runtimes.
