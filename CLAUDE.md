# CLAUDE.md — BugTrack Project Guide

> This file is the single source of truth for Claude Code when working on BugTrack.
> Read this entire file before writing any code, creating any file, or making any structural decision.
> The PRD (`docs/PRD.md`) contains the full feature specification. When in doubt, PRD wins over memory.

---

## 1. Project Overview

**BugTrack** is a standalone web application combining a Trello-style Kanban board with purpose-built bug tracking. Internal QA/dev teams and external clients collaborate on bugs through a visual board. Bugs are stored in the app's own database and pushed one-way to ClickUp and GitHub/GitLab.

**Two layers:**
- **Main App** — boards, cards, comments, notifications, integrations
- **Admin Panel** — user account management + board member limits (Super Admin only)

---

## 2. Absolute Rules (Never Break These)

1. **No TypeScript.** Plain JavaScript only throughout — frontend and any scripts.
2. **No `_regular_price` or pricing fields** in bug card data. This is a bug tracker, not an e-commerce app.
3. **Never return integration tokens to the frontend.** Tokens in `config_json` are encrypted at rest. API endpoints that touch integrations must strip token fields from all responses.
4. **Card always saves locally before any integration push.** Push failure must never lose data. Show retry button on card.
5. **Client role is strictly board-scoped.** A client must never see another board's cards, members, or metadata — enforce at the API layer, not just the UI.
6. **No self-registration without an invite link.** The only way to create an account is via an emailed invite or Super Admin creation.
7. **Tailwind CSS v3 only.** No Tailwind v4 syntax. No CSS modules. No styled-components.
8. **`--accent: #6c63ff`** is the primary accent colour throughout. Do not change it without explicit instruction.
9. **DSGVO compliance.** Never log PII unnecessarily. Support soft delete + data anonymisation. Timezone default is UTC+1.
10. **One feature at a time.** Build, test, commit. Never stub more than one layer ahead.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React 18 + Vite | Plain JS, no TypeScript |
| Styling | Tailwind CSS v3 | `--accent: #6c63ff`, dark bg on board |
| Drag & drop | `@dnd-kit/core` | Cards and columns |
| Backend | FastAPI (Python 3.11+) | Async throughout |
| ORM | SQLAlchemy (async) | `asyncpg` or `aiomysql` driver |
| Database | MySQL 8+ | See §8 for schema rules |
| Auth | JWT (access 15min + refresh 7d) + bcrypt | `python-jose`, `passlib[bcrypt]` |
| Email | SMTP via `aiosmtplib` | Configurable in `.env` |
| File storage | Local disk (`/uploads/`) for MVP | S3 in Phase 2 |
| Charts | Recharts | Bar, donut, line — board dashboard |
| Notifications | 30s polling (MVP) | WebSocket in Phase 2 |
| HTTP client | `httpx` (async) | For ClickUp / GitHub API calls |

---

## 4. Folder Structure

```
bugtrack/
├── CLAUDE.md                 ← this file (always read first)
├── docs/
│   └── PRD.md               ← full feature spec (source of truth)
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles/
│       │   └── globals.css   ← CSS variables, base styles
│       ├── components/
│       │   ├── board/        ← BoardView, Column, Card, CardModal
│       │   ├── panels/       ← LabelsPanel, MembersPanel, DatesPanel, AttachPanel, FilterPanel, ListActionsPanel, ShareBoardModal
│       │   ├── dashboard/    ← PerBoardDash, GlobalDash, StatCard, DonutChart, BarChart, TrendLine
│       │   ├── notifications/← NotifBell, NotifDropdown, NotifPage
│       │   ├── admin/        ← AdminShell, UsersTab, LimitsTab, InvitesTab, StatsTab, SettingsTab
│       │   ├── auth/         ← LoginPage, SignupPage, VerifyEmail, Setup2FA, Challenge2FA, InviteAccept, ForgotPassword, ResetPassword
│       │   ├── public/       ← LandingPage, PricingPage, UpgradePage
│       │   ├── archive/      ← ArchivePage, ArchivedCards, ArchivedLists
│       │   ├── shared/       ← Button, Input, Modal, Toast, Avatar, Badge, Kbd
│       │   └── layout/       ← GlobalNav, BoardNav, StatsBar
│       ├── hooks/
│       │   ├── useBoard.js
│       │   ├── useCard.js
│       │   ├── useNotifications.js
│       │   └── useAuth.js
│       ├── stores/
│       │   └── authStore.js  ← Zustand (or React context) for JWT + user
│       ├── api/
│       │   ├── client.js     ← axios instance, token refresh interceptor
│       │   ├── auth.js
│       │   ├── boards.js
│       │   ├── cards.js
│       │   ├── comments.js
│       │   ├── notifications.js
│       │   ├── integrations.js
│       │   └── admin.js
│       └── utils/
│           ├── dates.js      ← relative time, overdue check, recurring calc
│           ├── metadata.js   ← browser/OS/viewport auto-capture
│           └── shortcuts.js  ← keyboard shortcut registry
├── backend/
│   ├── main.py               ← FastAPI app, CORS, startup events
│   ├── config.py             ← Settings via pydantic-settings / .env
│   ├── database.py           ← async SQLAlchemy engine + session
│   ├── requirements.txt
│   ├── models/
│   │   ├── user.py
│   │   ├── board.py
│   │   ├── list_.py
│   │   ├── card.py
│   │   ├── label.py
│   │   ├── comment.py
│   │   ├── notification.py
│   │   ├── integration.py
│   │   ├── plan.py           ← Plan, PlanFeatureFlag
│   │   ├── system_config.py  ← SystemConfig
│   │   ├── login_attempt.py  ← LoginAttempt
│   │   ├── admin_audit_log.py← AdminAuditLog
│   │   └── ...              ← one file per data model entity
│   ├── schemas/             ← Pydantic request/response schemas
│   │   └── ...
│   ├── routers/
│   │   ├── auth.py           ← login + signup + OTP + 2FA + reset
│   │   ├── boards.py
│   │   ├── lists.py
│   │   ├── cards.py
│   │   ├── comments.py
│   │   ├── labels.py
│   │   ├── notifications.py
│   │   ├── integrations.py
│   │   ├── archive.py
│   │   ├── search.py
│   │   ├── dashboard.py
│   │   └── admin.py          ← includes /admin/settings
│   ├── services/
│   │   ├── auth_service.py   ← JWT, bcrypt, OTP gen/verify, TOTP, backup codes, lockout
│   │   ├── email_service.py  ← SMTP wrapper, all email templates
│   │   ├── push_service.py   ← ClickUp + GitHub/GitLab push logic
│   │   ├── notif_service.py  ← notification creation + polling endpoint
│   │   ├── plan_service.py   ← plan limit checks, feature flag lookups
│   │   └── activity_service.py ← write ActivityLog entries
│   ├── middleware/
│   │   └── auth.py           ← JWT bearer dependency, role checks
│   └── migrations/
│       └── ...               ← Alembic migrations
└── .env.example
```

---

## 5. Environment Variables (`.env.example`)

```env
# App
APP_SECRET_KEY=change-me-in-production
APP_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DB_URL=mysql+aiomysql://bugtrack:password@localhost:3306/bugtrack

# JWT
JWT_ACCESS_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@bugtrack.app

# File storage
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

# Encryption (for integration tokens + TOTP secrets)
ENCRYPTION_KEY=generate-with-fernet

# OTP / 2FA
OTP_EXPIRE_MINUTES=10
OTP_MAX_ATTEMPTS=3
OTP_RESEND_LIMIT_PER_HOUR=3
TOTP_ISSUER=BugTrack

# Account lockout
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=30

# Timezone default
DEFAULT_TIMEZONE=Europe/Berlin
```

---

## 6. Build Order (Follow This Sequence)

Claude Code must build in this order. Do not skip ahead. Each phase has a clear "done" condition before moving to the next.

### Phase 0 — Auth hardening, Plans, Public pages
- [ ] Add new columns to `User` model: `is_verified`, `email_otp_hash`, `email_otp_expires_at`, `email_otp_attempts`, `totp_secret_encrypted`, `two_fa_enabled`, `backup_codes_hash`, `plan_id`, `locked_until`
- [ ] New models + migrations: `Plan`, `PlanFeatureFlag`, `SystemConfig`, `LoginAttempt`, `AdminAuditLog`
- [ ] `POST /auth/signup` — create unverified user (`is_verified=false`), send OTP email
- [ ] `POST /auth/verify-email` — validate OTP hash, activate account, issue JWT
- [ ] `POST /auth/resend-otp` — rate-limited (3 per hour per email)
- [ ] Update `POST /auth/login` — check `is_verified`, check lockout, record `LoginAttempt`, return `requires_2fa: true` when 2FA enabled instead of full JWT
- [ ] `POST /auth/setup-2fa` — generate TOTP secret (encrypt with Fernet), return QR URI
- [ ] `POST /auth/confirm-2fa` — verify first TOTP, save encrypted secret, generate + hash 10 backup codes
- [ ] `POST /auth/login-2fa` — accept TOTP / email OTP / backup code, issue full JWT
- [ ] `GET /admin/settings` + `PATCH /admin/settings` — read/write `SystemConfig` (Super Admin only, audit logged)
- [ ] Frontend: Landing page (`/`) — public, hero + features + pricing teaser
- [ ] Frontend: Pricing page (`/pricing`) — public, plan comparison table driven from `Plan` + `PlanFeatureFlag`
- [ ] Frontend: `/verify-email` — OTP input (6 digits), resend link, countdown timer
- [ ] Frontend: `/setup-2fa` — QR code display, first-code confirmation, backup codes reveal
- [ ] Frontend: `/2fa` — challenge screen (TOTP / email OTP / backup code tabs)
- [ ] Frontend: `/upgrade` — in-app upgrade screen, plan comparison, CTA to contact/sales
- [ ] Frontend: Admin Settings tab in AdminShell (`/admin/settings`) — key-value table with edit

**Done when:** Signup → OTP verify → login works. 2FA setup and challenge work. Lockout blocks after 5 failures. Admin settings page saves to DB.

### Phase 1 — Project scaffolding
- [ ] Vite + React 18 project (`npm create vite@latest frontend -- --template react`)
- [ ] Install dependencies: `tailwindcss@3`, `@dnd-kit/core`, `recharts`, `axios`, `zustand`, `react-router-dom@6`
- [ ] Set up Tailwind config with `--accent`, `--bg-board`, colour tokens
- [ ] FastAPI project: `requirements.txt`, `main.py`, `config.py`, `database.py`
- [ ] MySQL database created, Alembic initialised
- [ ] `.env.example` and `.env` (local) in place
- [ ] `CORS` configured for `localhost:5173`

**Done when:** `npm run dev` and `uvicorn main:app --reload` both start without errors.

### Phase 2 — Auth system
- [ ] `User` model + migration
- [ ] `POST /auth/login` → returns access + refresh tokens
- [ ] `POST /auth/refresh` → returns new access token
- [ ] `POST /auth/forgot-password` → sends reset email
- [ ] `POST /auth/reset-password` → validates token, sets new password
- [ ] JWT bearer dependency (`get_current_user`)
- [ ] Frontend: LoginPage, auth store (Zustand), axios interceptor (auto-refresh on 401)
- [ ] Protected route wrapper

**Done when:** Login works end-to-end, JWT refresh works, reset email sends.

### Phase 3 — Admin panel
- [ ] `Super Admin` role check middleware
- [ ] `GET /admin/users` + `POST /admin/users` + `PATCH /admin/users/:id`
- [ ] `DELETE /admin/users/:id` (soft deactivate only)
- [ ] `GET /admin/boards` (read-only overview)
- [ ] `PATCH /admin/boards/:id/member-limit`
- [ ] `GET /admin/invites` + `DELETE /admin/invites/:id`
- [ ] Frontend: AdminShell + 4 tabs (Users, Limits, Invites, Stats)

**Done when:** Super Admin can manage users and set board limits.

### Phase 4 — Boards + My Boards
- [ ] `Board`, `BoardMembership`, `BoardActivityLog` models + migrations
- [ ] `POST /boards` (create), `GET /boards` (my boards list)
- [ ] `POST /boards/:id/invite` → sends invite email
- [ ] `POST /boards/:id/invite/accept` → registers or logs in user
- [ ] `GET /boards/:id/members`, `PATCH /boards/:id/members/:uid`, `DELETE /boards/:id/members/:uid`
- [ ] `ShareLink` model: `POST /boards/:id/share-link`, `DELETE /boards/:id/share-link`
- [ ] `JoinRequest` model: `POST /boards/:id/join-requests`, `PATCH /boards/:id/join-requests/:jid`
- [ ] Frontend: My Boards screen (sidebar + board grid), Share Board modal (3 tabs)

**Done when:** Board creation, invite flow, share link, and join requests all work.

### Phase 5 — Lists (columns)
- [ ] `List` model + migration (includes `wip_limit`, `is_archived`)
- [ ] `ListAutomationRule` model + migration
- [ ] Full CRUD: `GET`, `POST`, `PATCH`, `DELETE` `/boards/:id/lists`
- [ ] `POST /boards/:id/lists/:lid/archive`
- [ ] List reorder: `PATCH /boards/:id/lists/reorder` (array of IDs + positions)
- [ ] Frontend: Column component, col header, `⋯` menu → List Actions panel (all 8 actions + automation section)
- [ ] Frontend: drag-and-drop column reordering via `@dnd-kit`

**Done when:** Columns render, can be reordered, archived, and automation rules toggled.

### Phase 6 — Cards (the core)
- [ ] `Card`, `CardMeta`, `Label`, `CardLabel`, `CardAssignee` models + migrations
- [ ] Full CRUD: `GET`, `POST`, `PATCH`, `DELETE` `/boards/:id/cards`
- [ ] Card reorder within + between columns: `PATCH /cards/:id/move`
- [ ] `CardMeta` auto-capture: browser/OS/viewport/UA written on card creation
- [ ] `source` field: `internal` (team) or `client` (client role)
- [ ] Frontend: Card component (face — labels, title, priority flag, avatars, checklist progress, cover image, overdue badge)
- [ ] Frontend: drag-and-drop cards via `@dnd-kit`
- [ ] Frontend: Quick-add inline input (title only) at bottom of each column

**Done when:** Cards render correctly, drag between columns works, quick-add creates card.

### Phase 7 — Card detail modal
- [ ] `Checklist`, `ChecklistItem` models + migrations
- [ ] `Attachment` model + migration + `POST /cards/:id/attachments` file upload endpoint
- [ ] `ActivityLog` model + migration + `activity_service.py`
- [ ] Frontend: Full 2-column card modal — left (labels, assignees, dates, description, checklist, activity+comments feed), right (action sidebar)
- [ ] Frontend: Labels panel (full-width colour buttons, search, create)
- [ ] Frontend: Members panel (board member list, avatar, search)
- [ ] Frontend: Dates panel (calendar grid, start date, due date + time, recurring dropdown)
- [ ] Frontend: Attach panel (upload zone, link input, recently viewed)
- [ ] Frontend: `+ Add` dropdown → routes to each panel

**Done when:** Card modal opens with all fields, labels/members/dates/attach all work.

### Phase 8 — Comments + @mentions
- [ ] `Comment`, `CommentReply`, `CommentAttachment` models + migrations
- [ ] `POST /cards/:id/comments`, `PATCH /comments/:id`, `DELETE /comments/:id` (soft)
- [ ] `POST /comments/:id/replies`
- [ ] @mention detection in comment body → create `Notification` entries
- [ ] Frontend: Activity + comments feed (interleaved), edit, soft-delete, threaded reply

**Done when:** Comments post, edit, delete, replies work, @mentions fire notifications.

### Phase 9 — Notifications
- [ ] `Notification` model + `UserNotificationPrefs` model + migrations
- [ ] `notif_service.py` — centralised notification creation called from all relevant services
- [ ] `GET /notifications` (paginated), `PATCH /notifications/read-all`, `PATCH /notifications/:id/read`
- [ ] `GET /notifications/poll` — lightweight endpoint for 30s polling (returns unread count + latest 5)
- [ ] `GET /users/me/notification-prefs`, `PATCH /users/me/notification-prefs`
- [ ] Frontend: Bell icon + unread badge + dropdown panel (last 20) + full notifications page
- [ ] Frontend: Notification preference settings page (per event group toggles)
- [ ] Frontend: 30s polling hook (`useNotifications.js`)

**Done when:** Bell badge updates, clicking notification navigates to card, preferences save.

### Phase 10 — Filters, search, archive
- [ ] Frontend: Filter panel (7 filter groups, active chip state, AND logic, clear all)
- [ ] Backend: Card list endpoint supports filter query params
- [ ] `GET /search?q=&board_id=` — full-text search across cards user has access to
- [ ] Frontend: Global search bar (debounced 300ms, `/` shortcut, grouped results, recent searches)
- [ ] `POST /cards/:id/archive`, `POST /lists/:id/archive`, `POST /cards/:id/restore`
- [ ] `GET /boards/:id/archive` — archived cards + lists
- [ ] Frontend: Archive page (two tabs, search, restore, permanent delete)
- [ ] Frontend: 5-second undo toast on archive

**Done when:** Filters narrow board view, global search works, archive/restore work.

### Phase 11 — Integrations (ClickUp + GitHub/GitLab)
- [ ] `Integration`, `ExternalRef` models + migrations
- [ ] `POST /boards/:id/integrations` — save config (encrypt token with Fernet)
- [ ] `POST /cards/:id/push/:integration_type` — push to ClickUp or GitHub/GitLab
- [ ] `push_service.py` — httpx calls, error handling, retry flag
- [ ] Frontend: Push button on card detail sidebar, push status chip, retry button on failure
- [ ] Activity log entry on every push attempt

**Done when:** Manual push to ClickUp creates a task, GitHub creates an issue, failures show retry.

### Phase 12 — Dashboard + reports
- [ ] `GET /boards/:id/dashboard` — all stat cards + chart data
- [ ] `GET /dashboard/global` — global stats (scoped to user's boards)
- [ ] Frontend: Per-board dashboard — 6 stat cards + 7 charts (severity donut, priority donut, column bar, label bar, assignee stacked bar, trend line, source donut) + filter bar + PDF/CSV export
- [ ] Frontend: Global dashboard — 6 stat cards + 6 charts
- [ ] CSV export: filtered card data as downloadable file
- [ ] PDF export: `html2canvas` + `jsPDF` or backend-rendered (pick one)

**Done when:** Dashboard renders correct live data, CSV export downloads correctly.

### Phase 13 — UX polish
- [ ] Keyboard shortcuts (`N`, `F`, `B`, `A`, `Esc`, `?`) with reference overlay
- [ ] Session timeout warning toast (5 min before expiry), `sessionStorage` form preservation
- [ ] Profile page (name, avatar, initials colour, change password, delete account)
- [ ] First-board wizard (3 steps)
- [ ] Empty states on all 5 major views
- [ ] Bulk card actions (multi-select + action bar)
- [ ] Card duplicate
- [ ] Board summary stats bar (clickable → applies filter)
- [ ] Board-level activity feed (side panel)
- [ ] Column WIP limit (amber warning)
- [ ] Card cover image (set from attachments)
- [ ] @mention badge on card face

**Done when:** All UX items above are functional.

---

## 7. API Design Rules

- All endpoints are prefixed `/api/v1/`
- All responses use consistent shape:
  ```json
  { "data": ..., "meta": { "page": 1, "total": 42 } }
  // or for errors:
  { "error": { "code": "CARD_NOT_FOUND", "message": "..." } }
  ```
- HTTP status codes: `200` OK, `201` Created, `400` Bad request, `401` Unauth, `403` Forbidden, `404` Not found, `409` Conflict, `422` Validation error, `500` Server error
- All list endpoints support `?page=1&per_page=50` pagination
- Board-scoped endpoints check `BoardMembership` on every request — not just at login
- Never expose `password_hash`, `password_reset_token`, or `config_json` (integration tokens) in any response

---

## 8. Database Rules

- All tables use `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`
- All timestamps are `DATETIME` stored in **UTC**
- Soft deletes: use `is_archived` / `is_deleted` + timestamp columns. Never hard-delete cards, comments, or users.
- Indexes required: `(board_id)`, `(list_id)`, `(card_id)`, `(user_id)` on all join tables
- Full-text index on `cards(title, description)` for global search
- `config_json` on `integrations` table is `TEXT` with Fernet-encrypted content — never stored plain

### Key relationships
```
User ─< BoardMembership >─ Board
Board ─< List ─< Card
Card ─< CardLabel >─ Label (per board)
Card ─< CardAssignee >─ User
Card ─< Comment ─< CommentReply
Card ─< ActivityLog
Card ─< Checklist ─< ChecklistItem
Card ─< Attachment
Board ─< Integration ─< ExternalRef (per card)
Board ─< ShareLink
Board ─< JoinRequest
User ─< UserNotificationPrefs
User ─< Notification
List ─< ListAutomationRule
```

---

## 9. Frontend Component Rules

- Component files: PascalCase (`BoardView.jsx`, `CardModal.jsx`)
- Hook files: camelCase with `use` prefix (`useBoard.js`, `useNotifications.js`)
- No inline styles except for dynamic values (e.g., label colour from DB). Use Tailwind classes.
- Every icon-only button needs an `aria-label`
- All forms must preserve content in `sessionStorage` on unmount if the session might expire
- Priority flag colours (match PRD exactly):
  - Urgent: `#de350b` (red)
  - High: `#ff991f` (orange)
  - Normal: `#0079bf` (blue)
  - Low: `#8993a4` (grey)
- Severity badge colours:
  - Critical: `#de350b`
  - High: `#ff991f`
  - Medium: `#f2d600`
  - Low: `#61bd4f`
- Overdue cards: red left border (`border-l-4 border-red-500`) + red due date badge
- Card cover image: renders as a 80px top banner on card face
- Label strips on cards: full-width coloured bars (8px height collapsed, 20px expanded with text) — exact Trello pattern

---

## 10. Security Checklist (Every Endpoint)

Before marking any API endpoint complete:
- [ ] `get_current_user` dependency applied
- [ ] Role check performed (`super_admin`, `owner`, `team`, `client`)
- [ ] Board membership verified for board-scoped resources
- [ ] No sensitive fields in response (`password_hash`, `config_json`, `reset_token`, `email_otp_hash`, `totp_secret_encrypted`, `backup_codes_hash`)
- [ ] Input validated via Pydantic schema
- [ ] File uploads: check MIME type + enforce 10MB limit
- [ ] Tokens in `config_json`: encrypt on write, decrypt only inside service layer
- [ ] OTP endpoints: enforce rate limits, check expiry, check attempt count
- [ ] Login endpoint: check `is_verified`, check lockout, write `LoginAttempt` row
- [ ] Admin settings: log every change to `AdminAuditLog`
- [ ] 2FA challenge: accept only one of TOTP / email OTP / backup code per attempt; invalidate backup code after use

---

## 11. Email Templates Required

All emails sent via `email_service.py`. Each needs a plain-text + HTML version:

| Template | Trigger |
|----------|---------|
| `email_otp_verify` | Account signup — OTP to verify email address |
| `email_otp_2fa` | 2FA fallback — OTP sent as 2FA challenge option |
| `account_locked` | Account locked after too many failed logins |
| `invite_board` | User invited to a board |
| `new_user_welcome` | Client joins for the first time |
| `card_assigned` | Card assigned to user |
| `card_overdue` | Due date passed, card not closed |
| `comment_notification` | New comment on assigned card |
| `mention_notification` | @mentioned in comment/description |
| `reply_notification` | Reply to your comment |
| `join_request_received` | Board owner: someone requested access |
| `join_request_approved` | User: your request was approved |
| `join_request_declined` | User: your request was declined |
| `push_failed` | Integration push failed |
| `password_reset` | Forgot password request |

---

## 12. Known Constraints & Decisions

| # | Decision | Current status |
|---|----------|----------------|
| 1 | Sync direction | One-way push only (**not yet confirmed** — assume yes) |
| 2 | Kanban columns | Fully customisable ✅ confirmed |
| 3 | Admin model | Users only, no board access ✅ confirmed |
| 4 | Tech stack | React + FastAPI + MySQL (**not yet confirmed** — assume yes) |
| 5 | Email provider | SMTP via `aiosmtplib` (**not yet confirmed**) |
| 6 | File storage | Local disk for MVP (**not yet confirmed**) |
| 7 | Project name | BugTrack placeholder (**not yet confirmed**) |
| 8 | Screenshot capture | Upload-only for MVP (**not yet confirmed**) |
| 9 | Timezone default | UTC+1 / `Europe/Berlin` (**not yet confirmed**) |

If NMG updates any of these, update this table and note the change in a commit message.

---

## 13. What Claude Code Should NOT Do

- Do not install TypeScript, do not add `.ts` or `.tsx` files
- Do not use `Create React App` — use Vite only
- Do not add Tailwind v4 syntax
- Do not add in-app payment processing (Phase 2+) — pricing CTAs link to contact/sales email
- Do not add SSO / SAML login (Phase 2+)
- Do not add Slack notifications (Phase 2+)
- Do not add a browser extension (Phase 2+)
- Do not add WebSockets yet — use polling (Phase 2)
- Do not hard-delete users, cards, or comments — always soft delete
- Do not store integration tokens plain text anywhere
- Do not store TOTP secrets or OTP codes plain text — Fernet-encrypt secrets, bcrypt-hash OTPs
- Do not expose OTP hash, TOTP secret, or backup code hashes in any API response
- Do not add two-way sync with ClickUp/Git (Phase 2+)
- Do not create new DB migrations without running `alembic revision --autogenerate -m "description"` first
- Do not skip lockout checks on login — always check `LoginAttempt` count before issuing tokens

---

## 14. Quick Reference — Data Model Entities

34 entities total (from PRD §8, including Phase 0):

`User` · `UserNotificationPrefs` · `Board` · `BoardMembership` · `BoardActivityLog` · `Invite` · `ShareLink` · `JoinRequest` · `List` · `ListAutomationRule` · `Card` · `CardMeta` · `Checklist` · `ChecklistItem` · `Label` · `CardLabel` · `CardAssignee` · `Attachment` · `Comment` · `CommentReply` · `CommentAttachment` · `ActivityLog` · `Integration` · `ExternalRef` · `Notification` · `SLARule` · `DigestPreference` · `CardWatcher` · `CardTemplate` · `Plan` · `PlanFeatureFlag` · `SystemConfig` · `LoginAttempt` · `AdminAuditLog`

---

## 15. Running the Project

```bash
# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs (Swagger UI)

# MySQL
mysql -u root -p
CREATE DATABASE bugtrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bugtrack'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON bugtrack.* TO 'bugtrack'@'localhost';
FLUSH PRIVILEGES;
```

---

*Last updated: Jun 13, 2026 — PRD v1.1 · Phase 0 added: Landing/Pricing/Upgrade pages, Email OTP, 2FA (TOTP + backup codes), Plans, SystemConfig, AdminAuditLog, LoginAttempt lockout*
