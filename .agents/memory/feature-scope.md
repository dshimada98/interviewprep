---
name: Feature scope and ownership
description: User constraints for incremental InterviewPrep development and authentication scope.
---

Build InterviewPrep one feature at a time. Later features are to be built separately, each on its own branch.

**Why:** The user explicitly limited the initial build and said they will build the remaining features one at a time later.

**How to apply:** Implement only the feature explicitly requested in the current user brief; do not infer permission to build later features from the full roadmap.

Use custom in-app email/password authentication, not Replit Auth or third-party login. A separate PostgreSQL login-session storage table is approved as an exception to the original users-only table restriction.

**Why:** The brief requires PostgreSQL-backed express-session, and the user explicitly approved the additional session table when asked.

**How to apply:** Distinguish login-session infrastructure from practice-session product data. Additional product tables require an explicit feature request, not the infrastructure exception.

Do not change Git branches, merge, or push to main.

**Why:** The user said, “I manage Git myself.”

**How to apply:** Leave those Git operations to the user during implementation.

A brand-new account's empty dashboard is a critical user path.

**Why:** The user explicitly plans to sign up live during a demo and called out avoiding broken charts or “NaN” with no sessions.

**How to apply:** Check zero-session accounts alongside populated accounts when changing the dashboard or post-login landing page.

A story has one main behavioral competency, but the session dropdown includes all of the user's stories, with matching competencies first.

**Why:** The story-bank brief explicitly requests all owned stories ordered with matches first, and excludes multi-competency tags.

**How to apply:** Do not restrict links to stories whose competency equals the session's question type. Ownership and behavioral session kind are required; matching only affects ordering.
