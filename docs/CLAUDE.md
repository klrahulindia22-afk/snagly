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
| Styling | Tailwind CSS v3 | `--accent: #6c63ff`; board bg `#1d7a5f`, columns `#ebecf0`, cards `#fff`, nav `#006452` |
| Drag & drop | `@dnd-kit/core` | Cards and columns |
| Backend | FastAPI (Python 3.11+) | Async throughout |
| ORM | SQLAlchemy (async) | `asyncpg` or `aiomysql` driver |
| Database | MySQL 8+ | See §8 for schema rules |
| Auth | JWT (access 15min + refresh 7d) + bcrypt | `python-jose`, `passlib[bcrypt]` |
| Email | SMTP via `aiosmtplib` | Configurable in `.env` |
| File storage | Local disk (`/uploads/`) for MVP | S3 in Phase 2 |
| Charts | Recharts | Bar, donut, line — board dashboard |
| Notifications | 30s polling (MVP) + WebSocket | `wsService.js` already connected in `ProtectedRoute`; polling remains primary for MVP |
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
│       │   └── authStore.js  ← Zustand persist — access token in memory, refresh in localStorage
│       ├── services/
│       │   └── wsService.js  ← WebSocket client, connected in ProtectedRoute on accessToken change
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
│   │   ├── subscription.py   ← Subscription, PaymentMethod, Invoice
│   │   ├── coupon.py         ← Coupon, CouponRedemption
│   │   ├── webhook_event.py  ← WebhookEvent
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
│   │   ├── subscriptions.py  ← /subscriptions/* + /invoices/* + /payment-methods/*
│   │   ├── webhooks.py       ← /webhooks/stripe + /webhooks/razorpay
│   │   └── admin.py          ← /admin/* including /admin/subscriptions, /admin/coupons
│   ├── services/
│   │   ├── auth_service.py   ← JWT, bcrypt, OTP gen/verify, TOTP, backup codes, lockout
│   │   ├── email_service.py  ← SMTP wrapper, all email templates
│   │   ├── push_service.py   ← ClickUp + GitHub/GitLab push logic
│   │   ├── notif_service.py  ← notification creation + polling endpoint
│   │   ├── plan_service.py   ← plan limit checks, feature flag lookups, storage quota check
│   │   ├── subscription_service.py ← checkout, upgrade, downgrade, cancel, proration logic
│   │   ├── stripe_service.py ← Stripe SDK wrapper (customer, subscription, invoice, webhook verify)
│   │   ├── razorpay_service.py ← Razorpay SDK wrapper (customer, subscription, webhook verify)
│   │   ├── attachment_service.py ← file upload, storage quota enforcement, mime validation, delete + decrement
│   │   ├── activity_service.py ← write ActivityLog entries
│   │   └── digest_service.py ← email digest generation + dispatch (Phase 14)
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
MAX_UPLOAD_MB=500
# Note: per-upload file size limit is enforced per plan via PlanFeatureFlag(feature_key='max_file_size_mb').
# MAX_UPLOAD_MB is the hard server ceiling (never exceeded regardless of plan). Plan limit is always lower.

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

# Stripe (global payments — USD, EUR, GBP)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=USD

# Razorpay (India payments — INR)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_CURRENCY=INR

# Payment gateway routing (comma-separated country codes → gateway)
PAYMENT_GATEWAY_IN=razorpay
PAYMENT_GATEWAY_DEFAULT=stripe

# Grace period after subscription payment failure (days)
SUBSCRIPTION_GRACE_PERIOD_DAYS=7

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

### Phase 4 — Boards + My Boards + Membership system

#### Phase 4a — Core board infrastructure
- [ ] `Board` model: add `allow_join_requests BOOL DEFAULT TRUE` field + migration
- [ ] `BoardMembership` model: add `joined_via` field (enum: invite/share_link/join_request/direct) + migration
- [ ] `BoardActivityLog` model + migration (unchanged)
- [ ] `POST /api/v1/boards` — create board, owner auto-added as member
- [ ] `GET /api/v1/boards` — returns only boards user is a member of
- [ ] `PATCH /api/v1/boards/:id/members/:uid/role` — inline role change, writes `BoardMembershipLog`
- [ ] `DELETE /api/v1/boards/:id/members/:uid` — remove member, writes `BoardMembershipLog`, fires notification. Cannot remove only owner → 403 `CANNOT_REMOVE_ONLY_OWNER`.

#### Phase 4b — BoardMembershipLog (audit trail — new entity)
- [ ] `BoardMembershipLog` model: `id`, `board_id`, `user_id`, `action` (enum: added/removed/role_changed), `old_role` (nullable), `new_role` (nullable), `performed_by`, `source` (enum: invite/join_request/share_link/direct), `created_at` + migration
- [ ] Add index on `(board_id)` and `(user_id)`
- [ ] Write a `BoardMembershipLog` entry on every membership change — no exceptions

#### Phase 4c — Invite system (outbound)
- [ ] `Invite` model: rename `token` → `token_hash`, add `sent_by`, `resent_at`, `resent_count` (default 0), `status` (enum: pending/accepted/expired/revoked) + migration
- [ ] `POST /api/v1/boards/:id/invites` — generate token, store `sha256(token)`, send `invite_board` email. Checks: member limit, not already a member (409), no existing pending invite for same email (409).
- [ ] `GET /api/v1/boards/:id/invite/accept?token=` — hash token, look up `Invite`, verify status=pending and not expired. Create `BoardMembership`, set `status=accepted`, write `BoardMembershipLog { source: invite }`. Redirect to `/boards/:id`.
- [ ] `PATCH /api/v1/boards/:id/invites/:iid/resend` — generate new token, store new hash, reset `expires_at` to now+72h, increment `resent_count`, send `invite_resent` email.
- [ ] `DELETE /api/v1/boards/:id/invites/:iid` — set `status=revoked`, clears token_hash.
- [ ] Background job: every hour, set `status=expired` on invites where `expires_at < now AND status=pending`. Fire `invite_expired` in-app notification to Board Owner.

#### Phase 4d — Share link (fix and complete)
- [ ] `ShareLink` model: rename `token` → `token_hash` in DB, always store `sha256(token)` — never the plain token + migration
- [ ] `POST /api/v1/boards/:id/share-links` — generate token, return plain token **once only** in response, store hash
- [ ] `DELETE /api/v1/boards/:id/share-links/:lid` — set `is_active=false`
- [ ] `GET /api/v1/share-links/validate?token=` — **public, no auth required**. Hash input, look up `ShareLink`. Return `{ board_name, board_id, access_level }`. **Never return token or hash.** If invalid/revoked → 404.
- [ ] `POST /api/v1/share-links/use` — **requires auth**. Body: `{ token }`. Hash, look up, verify `is_active=true`. Create `BoardMembership` at link's `access_level`. Write `BoardMembershipLog { source: share_link }`. Check member limit first.
- [ ] **Frontend fix — React Router route:** `<Route path="/join/:token" element={<JoinByLink />} />` must exist. Without this route the share link 404s.
- [ ] **Frontend — `JoinByLink.jsx`:** extract token from params → call validate → if logged in call `use` → redirect to board. If not logged in: store token in `sessionStorage('pendingShareToken')` → redirect to `/login`. Post-login handler: check `sessionStorage`, call `use`, clear key, redirect to board.

#### Phase 4e — Join requests (inbound from team members)
- [ ] `JoinRequest` model: add `source` (enum: share_link/directory/direct_link), `message` (text, nullable, max 500), `decline_reason` (text, nullable), `status` (enum: pending/approved/declined/cancelled), `resolved_by` (nullable FK), `resolved_at` (nullable) + migration
- [ ] `GET /api/v1/boards/discover?q=` — **requires auth**. Returns boards where `allow_join_requests=true` AND requesting user is NOT a member. Returns: `board_id`, `board_name`, `owner_name`, `member_count` only — **no card data, no member emails**.
- [ ] `POST /api/v1/boards/:id/join-requests` — body: `{ source, message }`. Checks: not already a member (409 `ALREADY_MEMBER`), no existing pending request from same user (409 `REQUEST_ALREADY_PENDING`), `board.allow_join_requests=true` (403 `BOARD_NOT_DISCOVERABLE`). Creates `JoinRequest`, fires `join_request_received` notification to Board Owner.
- [ ] `DELETE /api/v1/boards/:id/join-requests/:jid` — requester cancels own pending request only. Sets `status=cancelled`. Fires in-app `join_request_cancelled` notification to Board Owner.
- [ ] `PATCH /api/v1/boards/:id/join-requests/:jid/approve` — body: `{ role }`. Owner/Team only. Check member limit → 403 `PLAN_LIMIT_REACHED` if exceeded. Create `BoardMembership`, write `BoardMembershipLog { source: join_request }`, set `status=approved`, fire `join_request_approved` notification to requester.
- [ ] `PATCH /api/v1/boards/:id/join-requests/:jid/decline` — body: `{ reason? }`. Set `status=declined`, store `decline_reason`, fire `join_request_declined` notification with reason.
- [ ] `GET /api/v1/users/me/join-requests` — returns pending `JoinRequest`s where `user_id=current_user` and `status=pending`. Fields: `board_id`, `board_name`, `board_color`, `source`, `requested_at`. Used by My Boards page pending section.

#### Phase 4f — Membership summary API (powers profile My Boards)
- [ ] `GET /api/v1/users/me/boards/membership-summary` — returns array of boards where `owner_id=current_user.id`, each with:
  - `active_members[]` — from `BoardMembership JOIN User`, includes `joined_via`, `last_active_at`
  - `pending_invites[]` — from `Invite` where `status IN (pending, expired)`, includes `sent_by_name`, `expires_at`, `resent_count`
  - `join_requests[]` — from `JoinRequest` where `status=pending`, includes requester user info, `source`, `message`
  - **Never return any token, token_hash, or password_hash field in any part of the response**

#### Phase 4g — Frontend: My Boards additions
- [ ] `FindBoardModal.jsx` — search input → `GET /boards/discover?q=` (debounced 400ms), result rows with Request button, inline message textarea form on click, Submit → `POST /boards/:id/join-requests { source: "directory", message }`. On success: button → "Sent" (disabled). On 409: button → "Pending".
- [ ] `MyBoards.jsx` — add "Find a board to join" section below board grid (hidden for client role). Add "Pending join requests" section (hidden when empty), polls `GET /users/me/join-requests` every 30s, Cancel button per row.

#### Phase 4h — Frontend: Profile My Boards section
- [ ] `ProfileBoardsPane.jsx` mounted at `/profile?tab=boards` with 4 tabs (URL-synced via `?section=`):
  - **Summary** — 2-col board card grid + drill panel showing active member table with inline role dropdown and Remove button
  - **Join requests** — grouped by board, Approve (role selector) + Decline (inline reason textarea) per row, red badge count
  - **Pending invites** — grouped by board, Resend + Revoke per row, amber/red expiry indicators
  - **All members** — full roster grouped by board, joined-via pill, Remove button, collapsed removed-members section with Re-invite button
- [ ] URL deep-link sync: `?section=summary|requests|invites|members` — notification email links must resolve correctly
- [ ] Top nav avatar dot indicator: red dot when pending join requests > 0, amber dot when expired invites > 0. Derived from membership-summary response, refreshed every 30s.

#### Phase 4i — Notification inline actions for join requests
- [ ] `NotifDropdown.jsx` — for `join_request_received` notification type: show requester name, board name, source pill, message preview (italic). Three inline buttons:
  - **Approve** → `PATCH /boards/:id/join-requests/:jid/approve { role: "team_member" }`. Green confirmation row inline.
  - **Decline** → expand inline reason textarea → **Send & decline** → `PATCH .../decline`. Row fades.
  - **Review in profile** → navigate to `/profile?tab=boards&section=requests`.

**Done when:** All four join paths work end-to-end. `/join/:token` route resolves correctly from cold URL. Profile My Boards section renders correct live data across all 4 tabs. Inline approval from notification works without page reload. Every membership change writes a `BoardMembershipLog` entry.

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
- [ ] `Attachment` model + migration — add `file_size_bytes BIGINT NOT NULL`, `mime_type VARCHAR(100) NOT NULL`, `file_name VARCHAR(255) NOT NULL` columns
- [ ] `attachment_service.py` — single entry point for all upload logic:
  - `validate_upload(user, card, file)` — runs all three checks in order before touching disk:
    1. MIME type in allowed list → 415 `MIME_TYPE_NOT_ALLOWED` if not
    2. `file.size > plan_limit(user, 'max_file_size_mb') * 1024 * 1024` → 413 `FILE_TOO_LARGE`
    3. `card.attachment_count >= plan_limit(user, 'max_attachments_per_card')` (skip if limit=0) → 403 `ATTACHMENT_LIMIT_REACHED`
    4. `user.storage_used_bytes + file.size > plan_limit(user, 'storage_limit_gb') * 1024**3` (skip if limit=0) → 403 `STORAGE_QUOTA_EXCEEDED`
  - `save_attachment(user, card, file)` — write to disk/S3, create `Attachment` row, atomically increment `user.storage_used_bytes`
  - `delete_attachment(user, attachment)` — delete file from disk/S3, delete `Attachment` row, atomically decrement `user.storage_used_bytes` (never below 0)
- [ ] `POST /api/v1/cards/:id/attachments` — multipart upload, calls `validate_upload` then `save_attachment`. Returns `{ id, file_name, file_size_bytes, mime_type, url }`.
- [ ] `DELETE /api/v1/attachments/:id` — calls `delete_attachment`. Only uploader or board owner can delete.
- [ ] `GET /api/v1/users/me/storage` — returns `{ used_bytes, limit_bytes, used_pct, file_count }`.
- [ ] `ActivityLog` model + migration + `activity_service.py`
- [ ] Frontend: Full 2-column card modal — left (labels, assignees, dates, description, checklist, activity+comments feed), right (action sidebar)
- [ ] Frontend: Labels panel (full-width colour buttons, search, create)
- [ ] Frontend: Members panel (board member list, avatar, search)
- [ ] Frontend: Dates panel (calendar grid, start date, due date + time, recurring dropdown)
- [ ] Frontend: Attach panel — upload zone shows plan limits: "Max [X MB] per file · [N] files per card". Disable attach button with tooltip when card limit reached. Pre-validate file size client-side before uploading (read `File.size` in JS, compare against plan limit from `/api/v1/users/me/storage`).
- [ ] Frontend: Storage usage bar in Profile → Subscription → Current plan tab. Amber at ≥ 80%, red at ≥ 95%.
- [ ] Frontend: Warning toast when upload would push usage above 80%: "You've used 80% of your [X GB] storage. [Upgrade →]". Hard block modal at 100%.
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

### Phase 14 — Command Palette + SLA Rules + Email Digests

#### Command Palette (PRD §5.24 — pure frontend, no new API)
- [ ] `CommandPalette.jsx` — full-screen dark backdrop, max-w-560px centered panel, auto-focused input
- [ ] Trigger: `Cmd+K` / `Ctrl+K` anywhere; dismiss: `Esc` or backdrop click; disabled while focus is inside a text editor
- [ ] Results sections (shown in order):
  - **Recent** (empty input) — last 10 visited boards + cards from `localStorage` key `bt_recent_items`, deduplicated
  - **Boards** (≥1 char) — client-side fuzzy match against user's boards list
  - **Cards** (≥2 chars) — calls `GET /api/v1/search?q=&per_page=8`, debounced 150ms
  - **Actions** (always) — filtered fixed actions: New card, Go to My Boards, Go to Notifications, Open Archive, Open Reports, Open Keyboard Shortcuts
- [ ] Keyboard navigation: `↑`/`↓` moves highlight, `Enter` executes, right-arrow icon on highlight
- [ ] Recent item tracking: every board visit + card modal open prepends to `bt_recent_items` (cap 10)
- [ ] State: `useState(open)` hoisted to `App.jsx`; open via global `Ctrl+K` listener already in `App.jsx`

#### SLA Rules Engine (PRD §5.25)
- [ ] `SLARule` model + migration (fields: `id`, `board_id`, `severity`, `hours_to_resolve`, `created_at`, `updated_at`; unique `(board_id, severity)`)
- [ ] `GET /boards/:id/sla-rules` — member read access
- [ ] `POST /boards/:id/sla-rules` — owner only; upsert behaviour (one rule per severity per board)
- [ ] `PATCH /boards/:id/sla-rules/:rule_id` — update `hours_to_resolve`; owner only
- [ ] `DELETE /boards/:id/sla-rules/:rule_id` — owner only
- [ ] Backend: on card create, if `severity` set + no `due_date` provided → check `SLARule` for board + severity → set `due_date = created_at + hours_to_resolve`; log to card `ActivityLog`: "Due date auto-set from SLA rule (Critical: 24h)"
- [ ] Card face: `getSLAStatus(card)` — hidden when >20% window remains; amber `#ff991f` clock icon in last 20%; red `#de350b` clock icon when past due
- [ ] Stats bar: add "SLA breached (n)" chip in red; clicking applies filter for SLA-breached, open cards
- [ ] Notifications: "SLA warning" event → notify assignees; "SLA breached" event → notify assignees + board owner
- [ ] Frontend: Board header → SLA Rules panel — list + edit rules per severity (4 rows max); default suggestions: Critical 24h, High 72h, Medium 168h, Low 336h

#### Email Digests (PRD §5.26)
- [ ] `DigestPreference` model + migration (fields: `id`, `user_id` unique FK, `frequency` enum off/daily/weekly, `send_hour` 0–23 UTC, `last_sent_at`, `created_at`, `updated_at`)
- [ ] `GET /api/v1/users/me/digest-prefs` — return current prefs
- [ ] `PATCH /api/v1/users/me/digest-prefs` — update frequency + send_hour
- [ ] `POST /api/v1/digest/trigger` — super admin only; optional `user_id`, `force: true` bypass 2h suppression
- [ ] `digest_service.py` — per user: query overdue assigned, newly assigned, cards with new activity; render email template; dispatch via `email_service.py`
- [ ] Delivery rules: skip if user had active session in last 2h; skip if no relevant content; add `List-Unsubscribe` headers
- [ ] Email template: branded HTML + plain-text fallback; sections: Overdue bugs assigned to me, Newly assigned, My cards with new activity, Board snapshot
- [ ] Frontend: Profile → Notification Settings — add Digest frequency (Off/Daily/Weekly) + send hour selector

**Done when:** Command palette opens with `Ctrl+K`, fuzzy-searches boards and cards, and runs fixed actions. SLA rules save per board, auto-set due dates on card create, and show clock icons. Digest preference saves; test trigger sends email.

### Phase 15 — Card Watchers + Card Templates

#### Card Watchers (PRD §5.22)
- [ ] `CardWatcher` model + migration (fields: `id`, `card_id`, `user_id`, `created_at`; unique `(card_id, user_id)`)
- [ ] `POST /api/v1/cards/:id/watch` — subscribe current user (201 or 200 if already watching)
- [ ] `DELETE /api/v1/cards/:id/watch` — unsubscribe current user
- [ ] `GET /api/v1/cards/:id/watchers` — list watchers (id, full_name, initials_color)
- [ ] Include `is_watching: bool` + `watcher_count: int` in card face response (board view — no extra call)
- [ ] Card detail right sidebar: Watch toggle button below assignees — "Watch" (outline eye) ↔ "Watching" (filled eye)
- [ ] Card face: eye icon + count in bottom-right when `watcher_count > 0` (already rendered in `Card.jsx`)
- [ ] Notification behaviour: watchers receive all assignee-level notifications (card moved, comment, @mention, due date changed, priority/severity changed, archived/restored); no double-notify when watcher = assignee
- [ ] Add "Cards I'm watching" event group to `UserNotificationPrefs` (email opt-in, off by default)

#### Card Templates (PRD §5.22)
- [ ] `CardTemplate` model + migration (fields: `id`, `board_id`, `name`, `description`, `severity` nullable, `priority` nullable, `checklist_json` JSON, `created_by_id`, `created_at`, `updated_at`)
- [ ] `GET /api/v1/boards/:id/templates` — member access; clients excluded
- [ ] `POST /api/v1/boards/:id/templates` — team + owner only
- [ ] `PATCH /api/v1/boards/:id/templates/:tid` — team + owner only
- [ ] `DELETE /api/v1/boards/:id/templates/:tid` — team + owner only
- [ ] Templates do **not** store: assignees, labels, attachments, due dates
- [ ] Frontend: Board header "Templates" button → **Template Manager** modal (list, edit, delete, use actions)
- [ ] Frontend: Column quick-add area — "Use template ▾" dropdown (already in `Column.jsx`); selecting a template opens full card modal pre-filled
- [ ] Frontend: Card ⋯ menu → "Save as template" → prompt for name, pre-fills fields from current card
- [ ] Clients cannot see or interact with templates (check role in API + hide UI)

**Done when:** Watch toggle saves to DB and notifies watchers. Template Manager CRUD works. Column template dropdown pre-fills card modal.

---

### Phase 16 — Subscription & Billing (PRD §5.28)

Build order within this phase: **backend first, then admin UI, then user-facing UI**. Do not build user-facing checkout until admin plan builder and webhook handling are both working.

#### Phase 16a — Data models + migrations

- [ ] `Plan` model: add fields `sort_order`, `is_highlighted`, `stripe_price_id_monthly`, `stripe_price_id_yearly`, `razorpay_plan_id_monthly`, `razorpay_plan_id_yearly` + migration
- [ ] `Subscription` model + migration (all fields per PRD §5.28-G)
- [ ] `PaymentMethod` model + migration
- [ ] `Invoice` model + migration — add UNIQUE index on `gateway_invoice_id` (idempotency)
- [ ] `Coupon` model + migration
- [ ] `CouponRedemption` model + migration
- [ ] `WebhookEvent` model + migration — add UNIQUE index on `event_id` (idempotency)
- [ ] `User` model: replace `plan_id FK → Plan` with `subscription_id FK → Subscription nullable` + migration
- [ ] `plan_service.py` helper: `get_user_plan(user)` — returns active plan from `user.subscription.plan_id`, or Free plan if `subscription_id IS NULL`
- [ ] Seed data: create 4 default plans (Free, Pro, Business, Enterprise) with all 18 `PlanFeatureFlag` rows per plan (use values from PRD §5.27 and §5.28)

#### Phase 16b — Gateway services

- [ ] `stripe_service.py`:
  - `create_customer(user)` → Stripe Customer, store `gateway_customer_id` on `Subscription`
  - `create_subscription(customer_id, stripe_price_id, trial_days)` → Stripe Subscription object
  - `upgrade_subscription(gateway_subscription_id, new_stripe_price_id)` → immediate proration
  - `downgrade_subscription(gateway_subscription_id, new_stripe_price_id)` → schedule at period end
  - `cancel_subscription(gateway_subscription_id, at_period_end=True)` → cancel with access until period end
  - `reactivate_subscription(gateway_subscription_id)` → clear `cancel_at_period_end`
  - `verify_webhook_signature(payload_bytes, sig_header, secret)` → raises on invalid
  - `get_invoice_pdf_url(gateway_invoice_id)` → hosted PDF link
- [ ] `razorpay_service.py`:
  - `create_customer(user)` → Razorpay Customer
  - `create_subscription(customer_id, razorpay_plan_id, trial_days)` → Razorpay Subscription
  - `cancel_subscription(gateway_subscription_id)` → cancel at end
  - `verify_webhook_signature(payload, signature, secret)` → raises on invalid
  - No proration available on Razorpay — downgrade handled by cancel + recreate at period end
- [ ] `subscription_service.py`:
  - `get_gateway_for_user(user)` → reads `PAYMENT_GATEWAY_IN` / `PAYMENT_GATEWAY_DEFAULT` from config; uses billing country from user profile
  - `checkout(user, plan_id, billing_cycle)` → creates `Subscription` row in `trialing/active` state, calls gateway service, returns `{ client_secret }` (Stripe) or `{ subscription_id, key_id }` (Razorpay)
  - `upgrade(user, new_plan_id)` → immediate. Calls gateway. Updates `Subscription.plan_id`. Fires `plan_upgraded` email.
  - `downgrade(user, new_plan_id)` → sets `cancel_at_period_end = true` on gateway, stores pending plan. Fires `plan_downgraded` email.
  - `cancel(user, reason)` → sets `cancel_at_period_end = true`. Fires `subscription_cancelled` email.
  - `reactivate(user)` → clears `cancel_at_period_end`. Fires `subscription_reactivated` email.
  - `apply_coupon(user, code)` → validates `Coupon` (active, not expired, not depleted, applies to plan), applies via gateway, creates `CouponRedemption`.
  - `apply_grace_period(subscription)` → sets `grace_period_ends_at = now + SUBSCRIPTION_GRACE_PERIOD_DAYS`. Called after 3rd payment failure.
  - `downgrade_to_free(user)` → sets `Subscription.status = canceled`, sets `User.subscription_id = NULL`, archives excess boards, disables integrations, fires `downgraded_to_free` email.

#### Phase 16c — Webhook handler

- [ ] `POST /api/v1/webhooks/stripe` — raw body required (do not parse JSON before signature verification)
  - Verify signature using `stripe_service.verify_webhook_signature()`
  - Look up `WebhookEvent` by `event_id` — if exists and `processed=True`, return 200 immediately (idempotency)
  - Insert `WebhookEvent` with `processed=False`
  - Route by `event_type` to the correct handler function (see PRD §5.28-E for full event list)
  - Update `WebhookEvent.processed = True`, `processed_at = now`
  - On handler exception: set `WebhookEvent.error = traceback`, return 500 (gateway will retry)
- [ ] `POST /api/v1/webhooks/razorpay` — same idempotency pattern, different signature method
- [ ] Handler functions (called from both webhook routers via `subscription_service`):
  - `on_subscription_activated(event)` → `Subscription.status = active`
  - `on_invoice_paid(event)` → create `Invoice` row, `status=paid`, fire `subscription_renewed` email
  - `on_payment_failed(event, attempt_number)` → create `Invoice` row `status=failed`; fire `payment_failed_1/2/final` email based on attempt; on attempt 3 call `apply_grace_period()`
  - `on_subscription_cancelled(event)` → call `downgrade_to_free()` after `grace_period_ends_at` (use background task / scheduler)
  - `on_trial_ending(event)` → fire `trial_ending_soon` email

#### Phase 16d — Subscription API router

- [ ] `GET /api/v1/plans` — public, no auth. Returns all `is_active=True` plans with `PlanFeatureFlag` rows. Cache 60s.
- [ ] `GET /api/v1/subscriptions/me` — current subscription, derived plan, usage stats (`boards_used`, `members_max`, `storage_used_bytes`, `storage_limit_bytes`)
- [ ] `POST /api/v1/subscriptions/checkout` — `{ plan_id, billing_cycle }` → calls `subscription_service.checkout()`
- [ ] `POST /api/v1/subscriptions/upgrade` — `{ plan_id }` → calls `subscription_service.upgrade()`
- [ ] `POST /api/v1/subscriptions/downgrade` — `{ plan_id }` → calls `subscription_service.downgrade()`
- [ ] `POST /api/v1/subscriptions/cancel` — `{ reason }` → calls `subscription_service.cancel()`
- [ ] `POST /api/v1/subscriptions/reactivate` → calls `subscription_service.reactivate()`
- [ ] `POST /api/v1/subscriptions/switch-cycle` — `{ billing_cycle: monthly|yearly }`
- [ ] `POST /api/v1/subscriptions/apply-coupon` — `{ code }` → calls `subscription_service.apply_coupon()`
- [ ] `GET /api/v1/invoices` — paginated, authenticated
- [ ] `GET /api/v1/invoices/:id/pdf` — redirect to `stripe_service.get_invoice_pdf_url()`
- [ ] `GET /api/v1/payment-methods/me`
- [ ] `DELETE /api/v1/payment-methods/:id`

#### Phase 16e — Admin subscription router

- [ ] `GET /api/v1/admin/subscriptions` — list all, filterable by plan/gateway/status. Super Admin only.
- [ ] `PATCH /api/v1/admin/subscriptions/:id` — `{ plan_id }` manual override. Writes to `AdminAuditLog`. Bypasses gateway — direct DB update only (for Enterprise accounts).
- [ ] `GET /api/v1/admin/revenue` — returns `{ mrr, arr, active_subscribers, trialing, canceled_this_month, churn_rate }`
- [ ] `GET /api/v1/admin/coupons` — list all
- [ ] `POST /api/v1/admin/coupons` — create coupon, validates code is unique
- [ ] `PATCH /api/v1/admin/coupons/:id` — update / set `is_active=False`

#### Phase 16f — Admin UI (frontend)

Build this before Phase 16g (user-facing). Admin must be able to configure plans and gateways before users can check out.

- [ ] `AdminSubscriptionsPane.jsx` — new section in `AdminShell.jsx`, added to admin sidebar nav
- [ ] **Plans tab:** plan overview grid (one card per plan, click to edit). Editor below grid with: basic info section, pricing section (monthly/yearly price, trial days, default cycle picker), limits section (max boards, members, storage), feature flags section (all 18 `PlanFeatureFlag` keys as toggles — numeric keys show inline number input). Save as draft / Publish / Delete buttons. Save calls `PATCH /admin/plans/:id`, Publish sets `is_active=True`.
- [ ] **Payment gateways tab:** two sections (Stripe, Razorpay). Key fields masked by default (show/hide toggle). Test mode indicator (detect `pk_test` / `rzp_test` prefix). Save encrypted to `SystemConfig`. Gateway routing rules list with add/remove.
- [ ] **Subscribers tab:** data table with email, plan badge, gateway pill, status pill, period end, cancel_at_period_end flag. Search by email. Filter by plan/gateway/status. "Override plan" action per row (opens modal with plan selector → `PATCH /admin/subscriptions/:id`). Admin cannot change gateway or payment method — only plan.
- [ ] **Coupons tab:** coupon list table + create form. Table: code, discount, applies to, uses/max, status, expires, deactivate button. Create form: code, type, value, plan, duration, max redemptions, expiry.
- [ ] Revenue stats bar above the 4 tabs: MRR / ARR / Active / Trialing / Churn — pulled from `GET /admin/revenue`.

#### Phase 16g — User-facing subscription UI (frontend)

Build after 16a–16f are complete and admin can manage plans end-to-end.

- [ ] Add "Subscription" to profile sidebar nav
- [ ] `ProfileSubscriptionPane.jsx` — 4-tab layout at `/profile?tab=subscription`
- [ ] **Current plan tab:**
  - Plan hero: icon + name + billing cycle pill + price + payment method + renewal date
  - Usage bars: boards (amber ≥80%, red ≥95%), members on largest board, storage
  - Feature list: included (✓ green) vs excluded (✗ crossed out + "requires [plan]" amber badge)
  - Trial countdown banner if `trial_end` within 14 days (amber ≤3 days, red day-of)
  - Payment failure banner if `status = past_due` with "Update card" CTA
  - Grace period banner if `grace_period_ends_at` is set
- [ ] **Change plan tab:**
  - Plan cards: Free / Pro / Business (Enterprise shows "Contact sales")
  - Current plan: blue border + "Current" badge. One tier up: green border + "Recommended" badge
  - Upgrade modal: prorated amount, card being charged, "Upgrade immediately" confirm
  - Downgrade modal: lists exactly what features are lost, effective date, "Keep [current plan]" and "Confirm downgrade" buttons
  - Below cards: plan comparison table (all 18 feature keys, ✓/✗ per plan)
- [ ] **Billing history tab:**
  - Invoice table: date, description (plan + cycle), amount, status pill, download (→ PDF URL), retry button for `failed` invoices
  - Payment method card: brand icon + masked number + expiry + "Update card" button (→ Stripe/Razorpay billing portal redirect)
- [ ] **Manage tab:**
  - Billing cycle switch: show savings calculation. "Switch to yearly" → `POST /subscriptions/switch-cycle`
  - Cancel subscription: "Access until [date]" info, offboarding reason dropdown (required), "Keep [plan]" and "Confirm cancel" buttons. Replace with "Reactivate" if `cancel_at_period_end = true`.
  - Coupon code input with Apply button → `POST /subscriptions/apply-coupon`
- [ ] **Upgrade screen `/upgrade`:**
  - Shown when user hits any plan limit (redirect from toast CTA)
  - Shows which limit was hit, current usage, plan comparison table, plan cards with CTAs
  - Pre-selects the plan that resolves the specific limit hit (e.g. board limit → highlights Pro)
- [ ] **Plan-limit enforcement toasts:**
  - Every plan-gated action in the app must call `usePlanLimits()` hook before proceeding
  - Hook reads plan limits from `GET /subscriptions/me` (cached in Zustand, refreshed on plan change)
  - Standard toast format: "[Feature] is not available on your [Plan] plan. [Upgrade →]"
  - Attach button on card: disabled state + tooltip when `card.attachment_count >= plan.max_attachments_per_card`

**Done when:** Admin can create/edit/publish plans and configure gateway keys. Stripe and Razorpay checkout both work end-to-end in test mode. Webhooks activate subscription and fire correct emails. User can upgrade, downgrade, cancel, and reactivate from profile. All plan limits enforced with correct error codes and upgrade CTAs.

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
Board ─< BoardMembershipLog
Board ─< List ─< Card
Card ─< CardLabel >─ Label (per board)
Card ─< CardAssignee >─ User
Card ─< Comment ─< CommentReply
Card ─< ActivityLog
Card ─< Checklist ─< ChecklistItem
Card ─< Attachment
Board ─< Integration ─< ExternalRef (per card)
Board ─< ShareLink
Board ─< Invite
Board ─< JoinRequest
JoinRequest ─> ShareLink (nullable FK — share_link_id)
JoinRequest ─> User (requester via user_id)
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
- **Attachment upload rules (frontend enforcement — backend re-validates all):**
  - Read plan limits from `GET /api/v1/users/me/storage` (cached in zustand store, refreshed after each upload/delete)
  - Pre-validate `file.size <= planLimits.max_file_size_mb * 1024 * 1024` before dispatching upload — show inline error, do not send
  - Disable the "Attach" button and show tooltip `"Limit reached ([N]/[N])"` when `card.attachment_count >= planLimits.max_attachments_per_card` (skip check if limit = 0)
  - Show storage bar in profile subscription tab — amber class at ≥ 80%, red class at ≥ 95%
  - At 100% storage: replace attach button with a "Storage full" badge linking to `/upgrade`
  - Attach panel sub-label: `"Max [X MB] per file · [N] files per card · [X GB] total"` — populated from plan limits
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

### UI Theme (matches `bugtrack-v2.html` reference design)
- Nav: `#006452` (dark green, `--bg-nav`), height `h-10`
- Board background: `#1d7a5f` (dark green, `--bg-board`) — set on `ProtectedRoute` wrapper
- Columns: `#ebecf0` (light gray, `--bg-col`) with `border border-[#c1c7d0]`
- Cards: white `#ffffff` (`--bg-card`) with `border-gray-200 shadow-sm`
- Accent: `#6c63ff` (`--accent`) — buttons, rings, active states, watchers
- Accent hover: `#5b52e0` — hover state for accent-coloured buttons
- CSS variables defined in `frontend/src/styles/globals.css` — do not use hardcoded hex for these colours; use the variable or its Tailwind equivalent
- Priority flag: rectangular `w-2.5 h-3.5 rounded-sm` (not a circle)
- Severity badge text: `#fff` for critical/high, `#172b4d` for medium/low

---

## 10. Security Checklist (Every Endpoint)

Before marking any API endpoint complete:
- [ ] `get_current_user` dependency applied
- [ ] Role check performed (`super_admin`, `owner`, `team`, `client`)
- [ ] Board membership verified for board-scoped resources
- [ ] No sensitive fields in response (`password_hash`, `config_json`, `reset_token`, `email_otp_hash`, `totp_secret_encrypted`, `backup_codes_hash`, `token_hash`)
- [ ] Input validated via Pydantic schema
- [ ] File uploads — four-layer enforcement via `attachment_service.validate_upload()`:
  1. MIME type in allowed list (check both `Content-Type` header AND magic bytes — never trust extension alone)
  2. File size ≤ `plan_limit(user, 'max_file_size_mb')` MB — 413 if exceeded
  3. Card attachment count < `plan_limit(user, 'max_attachments_per_card')` — 403 `ATTACHMENT_LIMIT_REACHED` if exceeded (skip check if limit = 0)
  4. `user.storage_used_bytes + file_size ≤ plan_storage_limit` — 403 `STORAGE_QUOTA_EXCEEDED` if exceeded (skip check if limit = 0)
  Never call `save_attachment()` unless all four pass. Frontend pre-checks (1) and (2) only — backend must re-validate all four.
- [ ] Tokens in `config_json`: encrypt on write, decrypt only inside service layer
- [ ] OTP endpoints: enforce rate limits, check expiry, check attempt count
- [ ] Login endpoint: check `is_verified`, check lockout, write `LoginAttempt` row
- [ ] Admin settings: log every change to `AdminAuditLog`
- [ ] 2FA challenge: accept only one of TOTP / email OTP / backup code per attempt; invalidate backup code after use

**Additional checks for Phase 4 membership endpoints:**
- [ ] `GET /share-links/validate` — public, no auth. Return only `{ board_name, board_id, access_level }`. No token, no hash, no member data whatsoever.
- [ ] `POST /share-links/use` — hash the incoming plain token before DB lookup. Never store or log plain token.
- [ ] `GET /boards/discover` — only return boards with `allow_join_requests=true`. Return only `board_id`, `board_name`, `owner_name`, `member_count`. No card data, no member emails.
- [ ] `GET /users/me/boards/membership-summary` — only return boards where `owner_id = current_user.id`. Non-owners who are members of a board see nothing from this endpoint.
- [ ] `POST /boards/:id/join-requests` — three guard checks before creating: (1) not already a member → 409 `ALREADY_MEMBER`, (2) pending request already exists from same user → 409 `REQUEST_ALREADY_PENDING`, (3) `board.allow_join_requests=false` → 403 `BOARD_NOT_DISCOVERABLE`.
- [ ] `PATCH /boards/:id/join-requests/:jid/approve` — check member limit before creating `BoardMembership`. If exceeded → 403 `PLAN_LIMIT_REACHED`.
- [ ] Every `BoardMembershipLog` write — `performed_by` must never be null. `source` must be a valid enum value. This is an audit trail — never skip it.
- [ ] `DELETE /boards/:id/members/:uid` — cannot remove the board's only owner → 403 `CANNOT_REMOVE_ONLY_OWNER`.

---

## 11. Email Templates Required

All emails sent via `email_service.py`. Each needs a plain-text + HTML version:

| Template | Trigger |
|----------|---------|
| `email_otp_verify` | Account signup — OTP to verify email address |
| `email_otp_2fa` | 2FA fallback — OTP sent as 2FA challenge option |
| `account_locked` | Account locked after too many failed logins |
| `invite_board` | User invited to a board |
| `invite_resent` | Invite resent to same address with a fresh link |
| `new_user_welcome` | Client joins for the first time |
| `card_assigned` | Card assigned to user |
| `card_overdue` | Due date passed, card not closed |
| `comment_notification` | New comment on assigned card |
| `mention_notification` | @mentioned in comment/description |
| `reply_notification` | Reply to your comment |
| `join_request_received` | Board owner: someone requested access (includes source pill, message) |
| `join_request_approved` | User: your request was approved (includes board name, role assigned) |
| `join_request_declined` | User: your request was declined (includes optional decline reason) |
| `member_removed` | User: you have been removed from a board |
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
- Do not add SSO / SAML login (Phase 2+)
- Do not add Slack notifications (Phase 2+)
- Do not add a browser extension (Phase 2+)
- Do not store Stripe or Razorpay secret keys in code — always read from env vars or `SystemConfig` (encrypted)
- Do not log webhook payloads to stdout in production — store in `WebhookEvent.payload_json` only
- Do not bypass `WebhookEvent` idempotency check — every webhook handler must check `event_id` before processing
- Do not add a second WebSocket implementation — `wsService.js` is already connected in `ProtectedRoute`; polling remains the primary notification delivery mechanism for MVP
- Do not hard-delete users, cards, or comments — always soft delete
- Do not store integration tokens plain text anywhere
- Do not store TOTP secrets or OTP codes plain text — Fernet-encrypt secrets, bcrypt-hash OTPs
- Do not expose OTP hash, TOTP secret, or backup code hashes in any API response
- Do not add two-way sync with ClickUp/Git (Phase 2+)
- Do not create new DB migrations without running `alembic revision --autogenerate -m "description"` first
- Do not skip lockout checks on login — always check `LoginAttempt` count before issuing tokens

---

## 14. Quick Reference — Data Model Entities

43 entities total (PRD v1.4 — including Phase 0, Phase 4 membership, §5.27 attachment limits, §5.28 subscription):

`User` · `UserNotificationPrefs` · `Board` · `BoardMembership` · `BoardMembershipLog` · `BoardActivityLog` · `Invite` · `ShareLink` · `JoinRequest` · `List` · `ListAutomationRule` · `Card` · `CardMeta` · `Checklist` · `ChecklistItem` · `Label` · `CardLabel` · `CardAssignee` · `Attachment` · `Comment` · `CommentReply` · `CommentAttachment` · `ActivityLog` · `Integration` · `ExternalRef` · `Notification` · `SLARule` · `DigestPreference` · `CardWatcher` · `CardTemplate` · `Plan` · `PlanFeatureFlag` · `Subscription` · `PaymentMethod` · `Invoice` · `Coupon` · `CouponRedemption` · `WebhookEvent` · `SystemConfig` · `LoginAttempt` · `AdminAuditLog`

---

## 15. Running the Project

```bash
# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173

# Backend  (Python venv is at backend/venv/ — Windows path: backend\venv\Scripts\python.exe)
cd backend
python -m venv venv
# Windows: venv\Scripts\activate  |  macOS/Linux: source venv/bin/activate
venv\Scripts\activate
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

*Last updated: Jun 14, 2026 — PRD v1.4 · Phase 16 (Subscription & Billing) added: 7 sub-phases (16a data models, 16b gateway services, 16c webhook handler, 16d subscription API, 16e admin API, 16f admin UI, 16g user UI); Stripe + Razorpay service files; subscription_service.py with full upgrade/downgrade/cancel/coupon logic; webhook idempotency pattern; admin Subscriptions pane (Plans/Gateways/Subscribers/Coupons/Revenue); user ProfileSubscriptionPane (4 tabs); plan-limit enforcement hook; upgrade screen; entity count updated to 43; no-payment rule removed; 3 security rules for gateway keys and webhook logging added; .env updated with Stripe/Razorpay vars*
