---
name: Feature scope and ownership
description: User constraints for incremental InterviewPrep development and authentication scope.
---

Build InterviewPrep one feature at a time. The current requested scope is Feature 1, sign up and login; later features are to be built separately, each on its own branch.

**Why:** The user explicitly limited the initial build and said they will build the remaining features one at a time later.

**How to apply:** Do not add interview practice sessions, scorecards, stars, dashboards, stories, or other later features without a new request.

Use custom in-app email/password authentication, not Replit Auth or third-party login. A separate PostgreSQL login-session storage table is approved as an exception to the original users-only table restriction.

**Why:** The brief requires PostgreSQL-backed express-session, and the user explicitly approved the additional session table when asked.

**How to apply:** Distinguish authentication sessions from the out-of-scope interview practice sessions; do not use the exception to add unrelated tables.

Do not change Git branches, merge, or push to main.

**Why:** The user said, “I manage Git myself.”

**How to apply:** Leave those Git operations to the user during implementation.
