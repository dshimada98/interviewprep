# InterviewPrep — Overall Project Plan

## 1. Purpose and Scope

InterviewPrep is a consulting case and behavioral interview preparation tracker.
Build it incrementally, one feature at a time, so each feature can be reviewed
and tested before the next is started.

Only Feature 1 is currently specified and approved for implementation. The
uploaded briefs refer to an existing full-product plan, but that document was
not supplied. This plan records the available requirements and labels the
later roadmap as provisional rather than inventing approved specifications.

## 2. Development Rules

- Build only the feature currently requested.
- Build later features separately, each on its own branch.
- The user manages Git. Do not change branches, merge, or push to main.
- Do not create future-feature screens, endpoints, or database tables early.
- Confirm each later feature's behavior and data requirements before building it.
- Reuse the shared authentication, layout, and theme foundations.

## 3. Technical Foundation

- **Frontend:** React.
- **Backend:** Node.js and Express.
- **Database:** Replit's built-in PostgreSQL.
- **App structure:** Create and export the Express app separately from the
  file that starts the server, so later automated tests can import the app
  without starting a network listener.
- **Authentication:** Custom in-app email/password authentication. Do not use
  Replit Auth, Google login, or third-party login providers.
- **Passwords:** Store bcrypt hashes only. Never store or log plaintext passwords.
- **Login sessions:** Use `express-session` with PostgreSQL persistence,
  an httpOnly cookie, and the secret read from `SESSION_SECRET`.
- **API protection:** Use shared authentication middleware for protected API
  routes. Unauthenticated requests return HTTP 401. Public authentication
  endpoints must remain explicitly accessible.

## 4. Shared Design Foundation

Use a clean, professional “consulting deck” style with ample white space and
Inter as the font. Define these values once in a reusable shared theme:

| Purpose | Value |
| --- | --- |
| Background | White (`#FFFFFF`) |
| Header and primary text | Navy (`#1F2A44`) |
| Cards | Light gray (`#F2F4F7`) |
| Primary accent | Green (`#2E9E6B`) |
| Score 1–2 | Red (`#C0392B`) |
| Score 3 | Amber (`#D68910`) |
| Score 4–5 | Green (`#2E9E6B`) |

The score colors are theme definitions only during Feature 1; do not build
scoring functionality yet.

### Responsive and accessible behavior

- Design mobile-first for phones around 375px wide and for laptops.
- Use a single-column layout on phones.
- Make inputs and buttons at least 44px tall.
- Prevent horizontal page scrolling.
- Collapse header links into a compact menu on phones.
- Keep logout accessible on every authenticated page at all screen sizes.
- Provide visible labels, readable contrast, keyboard access, and focus states.

## 5. Feature 1 — Sign Up and Login

### Goal

Let a user create an account, log in, see a protected welcome page, and log out.

### Database

Create a `users` table with:

| Field | Requirements |
| --- | --- |
| `id` | Primary key |
| `email` | Text, unique, required, stored in lowercase |
| `password_hash` | Text, required |
| `created_at` | Timestamp |

Create one additional PostgreSQL table solely for login-session storage.
The user explicitly approved this exception to the original users-only
restriction.

Do not create any other tables during Feature 1. Login sessions are distinct
from the interview practice sessions in the future roadmap.

### Sign up

- Fields: email, password, confirm password.
- Require all fields.
- Require a password of at least 8 characters.
- Require the password and confirmation to match.
- Store emails in lowercase so differently capitalized versions are the
  same account.
- Validate input on the server as well as in the frontend.
- Hash the password with bcrypt before saving the user.
- Enforce email uniqueness in PostgreSQL.
- On success, establish a login session and open the welcome page.

### Login

- Fields: email and password.
- Require both fields.
- Normalize the email consistently with sign up.
- Compare the submitted password against the stored bcrypt hash.
- Use the same error for an unknown email and an incorrect password.
- On success, establish a login session and open the welcome page.

### Protected welcome page and header

- Display exactly: **Welcome to InterviewPrep**.
- Show the logged-in user's email.
- Display a header with the app name **InterviewPrep** and a **Log out** button.
- Reuse this header on every future logged-in page.
- Redirect unauthenticated visitors to the login page.
- Preserve login across page refreshes while the session remains valid.

### Logout and session security

- Destroy the server-side session and clear the cookie on logout.
- Return the user to login and prevent subsequent access to protected content
  without authenticating again.
- Read `SESSION_SECRET` from the environment; never hardcode or expose it.
- Use an httpOnly cookie and appropriate secure production cookie settings.
- Regenerate the session when authentication succeeds.
- Protect future API routes by default, excluding explicitly public
  authentication endpoints.

### Exact inline error messages

Show errors on the page, not in browser alerts.

| Condition | Message |
| --- | --- |
| Email already registered | An account with this email already exists. Try logging in. |
| Wrong email or password | Email or password is incorrect. |
| Password confirmation mismatch | Passwords don't match. |
| Password too short | Password must be at least 8 characters. |
| Blank required fields | Please fill in all fields. |

### Acceptance checks

1. A new user can sign up and reach the welcome page showing their email.
2. Missing fields, short passwords, and mismatched confirmation show the
   required inline messages.
3. Duplicate emails, including differently capitalized versions, show the
   required duplicate-account message.
4. Valid credentials log the user in.
5. Unknown emails and incorrect passwords show the same required error.
6. Refreshing the welcome page preserves a valid login.
7. Unauthenticated visits to protected pages redirect to login.
8. Unauthenticated protected API requests return HTTP 401.
9. Logout invalidates the session and removes access to protected content.
10. Passwords are hashed in storage and never logged or returned.
11. Phone and laptop layouts meet the shared design requirements.
12. Only the users and login-session tables are introduced.

### Delivery requirements

When Feature 1 implementation is complete, provide:

1. A list of created or changed files.
2. A plain-English explanation of sign up, login, and logout, from clicking
   a button through server processing and database storage.
3. Step-by-step manual testing instructions.
4. Instructions for adding `SESSION_SECRET` through Replit Secrets, without
   reading or displaying an existing secret value.

### Explicitly out of scope

- Interview practice sessions.
- Scorecards or scoring UI.
- Stars.
- Dashboard.
- Behavioral stories.
- Password reset, email verification, and social login.
- Any other feature beyond Feature 1.

## 6. Future Roadmap — Provisional

The briefs name these future areas but do not define their requirements.
The order below is a planning suggestion, not approved feature numbering or
authorization to implement. None belongs in the Feature 1 build.

| Area | Proposed purpose | Decisions needed before implementation |
| --- | --- | --- |
| Practice sessions | Track interview preparation practice. | Session types, required fields, lifecycle, editing/deletion, and differences between case and behavioral practice. |
| Scorecards | Record assessments of practice. | Evaluation criteria, application of the 1–5 scale, who scores, and links to practice sessions. |
| Stars | Support the intended starring or prioritization behavior. | What a star means, which items can be starred, and where they appear. |
| Dashboard | Summarize preparation activity and progress. | Metrics, time ranges, filters, and underlying feature dependencies. |
| Behavioral stories | Organize material for behavioral interview preparation. | Story structure, categories, editing/deletion, and links to practice. |

Further capabilities require a separate request. This outline does not imply
payments, AI coaching, social features, integrations, or other additional scope.

## 7. Process for Later Features

1. Confirm the feature's purpose and observable user behavior.
2. Agree on fields, validation, empty/error states, and create/edit/delete
   behavior where relevant.
3. Define only the database additions required for that feature, including
   user ownership and authorization.
4. Have the user prepare the intended Git branch.
5. Implement only the agreed scope using the shared foundations.
6. Verify behavior, access control, and phone/laptop layouts.
7. Deliver the changed-file list, explanation, and manual test instructions.
   Leave merging and pushing to the user.
