# Product Requirements Document — Bug Reporting & Project Management Tool

> **Status:** Draft v1.1 — Phase 0 added: Landing/Pricing, Email OTP, 2FA, Plans, Admin Settings
> **Owner:** NMG (NMG Technologies)
> **Working name:** BugTrack *(placeholder — confirm name)*
> **Build method:** Claude Code (PRD → Design → Project setup with CLAUDE.md)

---

## 1. Overview

A **standalone web application** that combines a Trello-style Kanban board with purpose-built bug tracking. Both internal QA/dev teams and external clients can submit, manage, and track bugs through a visual board interface. All bugs are stored in the app's own database and pushed out to **ClickUp** and **GitHub/GitLab** based on per-board configuration.

The tool has two distinct layers:
- **Admin Panel** — manages user accounts and sets board-level limits.
- **Main App** — board owners and members create boards, manage bugs, collaborate via comments, and integrate with external tools.

---

## 2. Problem Statement

Bug reports today arrive through scattered channels — email, WhatsApp, Slack, calls — with missing context, no status visibility for clients, and manual re-entry into ClickUp or Git. There is no single place for clients and the dev team to see the same picture.

This tool centralises intake, captures environment metadata automatically, gives clients a clean Kanban view of their bugs, and syncs to the team's existing workflow tools.

---

## 3. Goals & Non-Goals

### Goals
- Trello-style Kanban board with customisable columns, drag-and-drop cards.
- Purpose-built bug card with auto-captured metadata, labels, assignees, attachments.
- Role-based access: clients scoped to their own boards; team sees what they're invited to.
- Card-level chat/comments with @mentions and email + in-app notifications.
- Full card activity history (who did what, when).
- Board sharing via email invite, shareable link (with access levels), and join requests.
- One-way push to ClickUp + GitHub/GitLab.
- Per-board and global dashboard with stat cards + visual charts (severity, priority, labels, assignee, trend, source).
- Admin panel for user account management and board member limits.

### Non-Goals (MVP)
- Two-way real-time sync with ClickUp/Git.
- Native mobile apps (responsive web is sufficient).
- Time tracking, sprint planning, billing.
- Browser extension / embeddable snippet for in-situ bug capture.
- SSO / SAML login.

---

## 4. User Roles & Access

### 4.1 Role hierarchy

| Role | Scope | Capabilities |
|------|-------|--------------|
| **Super Admin** | Platform-wide | Manage all user accounts, create/deactivate users, set member limits per board, view platform usage. Cannot create boards themselves. |
| **Board Owner** | Per board | Create boards, invite members via email, manage columns, configure integrations, delete the board, all member capabilities. |
| **Board Member (Team)** | Per board | View all bugs, add/edit/move cards, add lists/columns, assign bugs, comment, apply labels, push to ClickUp/Git. |
| **Board Member (Client)** | Per board | Submit bugs, view cards on their board, comment on their own cards. Cannot see other boards. |

> All roles require login before accessing any part of the app.

### 4.2 Authentication

#### Standard login
- Email + password login for all users.
- JWT-based sessions (access 15 min + refresh 7 days).
- Passwords hashed (bcrypt).
- Board access is granted only via invite — no self-registration without an invite link.

#### Email OTP verification
- On signup (or admin-created accounts on first login), users must verify their email address via a **6-digit OTP** sent to their inbox.
- OTP is valid for 10 minutes and hashed in the database (never stored plain).
- Up to 3 verification attempts before the OTP is invalidated (requires resend).
- Resend is rate-limited: maximum 3 resends per hour per email.
- Unverified users cannot access the app beyond the `/verify-email` screen.

#### Two-factor authentication (2FA)
- Optional TOTP-based 2FA (compatible with Google Authenticator, Authy, etc.).
- Setup flow: user navigates to Profile → Security → Enable 2FA. Backend generates a TOTP secret (encrypted at rest), returns a QR code URL for the authenticator app. User confirms by entering their first TOTP code.
- On confirmation, 10 single-use backup codes are generated, shown once, and their hashes stored in DB.
- When 2FA is enabled, login requires: email + password (step 1) → 2FA challenge screen (step 2) → issue full JWT.
- 2FA challenge accepts: TOTP code, email OTP (fallback), or a backup code.
- Super Admin can force-disable 2FA on a user account (admin audit logged).

#### Account lockout
- After 5 consecutive failed login attempts within 15 minutes, the account is locked for 30 minutes.
- Lockout is tracked in the `LoginAttempt` table (IP address + email, timestamp).
- Locked-out users see a clear message with time remaining. Admins can manually unlock.

---

## 5. Core Features

### 5.1 Kanban Board

- **Customisable columns** per board — default set: `Backlog → Open → In Progress → Review → Closed`. Board owners/members can:
  - Add new columns (lists).
  - Rename columns.
  - Reorder columns (drag-and-drop).
  - Delete empty columns.
- **Drag-and-drop cards** between columns. Every move is recorded in card history.
- **Board header** shows: board name, member avatars, invite button, integration status.
- **Date/time** auto-displayed on every card (created at, last updated). All timestamps in the board's configured timezone; displayed relative (e.g. "2 hours ago") with absolute on hover.

### 5.2 Bug Card

Each card represents one bug. Fields:

| Field | Type | Notes |
|-------|------|-------|
| Title | Text (required) | Short summary |
| Description | Rich text | Markdown support |
| Steps to reproduce | Rich text | |
| Expected vs Actual | Rich text | |
| Severity | Select | Critical / High / Medium / Low |
| Priority | Select | Urgent / High / Normal / Low — shown as coloured flag icon on card face |
| Labels | Multi-select | Dynamic, per-board (see §5.6) |
| Assignees | Multi-user | Triggers email + in-app notification on assign |
| Attachments | File upload | Images, videos, PDFs |
| URL where it happened | Text | |
| Due date | Date + time picker | Optional. Includes: start date (optional), due date + time, recurring schedule (see §5.11) |
| Column / Status | Auto | Set by which column card is in |
| Created at | Auto | Timestamp, set on creation |
| Updated at | Auto | Timestamp, updated on every change |

**Auto-captured metadata** (silently recorded at submission time):
- Browser + version
- Operating system
- Screen / viewport size
- Page URL
- User agent string
- Reporter identity + timestamp

> Note: since this is a standalone web app (not embedded in the client's site), metadata is captured from the reporter's browser at the moment they fill the form — not from the buggy page itself.

### 5.3 Manual Bug Entry by Testing Team

The testing team (Board Members with Team role) can add bugs directly without going through the client-facing form. Two entry paths:

#### Quick-add (inline on board)
- Every column has a **"+ Add card"** button at the bottom (standard Trello-style).
- Clicking it opens a small inline input: **Title only** (required) + **Add Card** confirm button.
- Card is immediately created in that column with the title, reporter set to the logged-in user, and timestamp auto-set.
- The quick-add card appears on the board instantly — no page reload.

#### Expanded detail form (optional, opened from the card)
- After quick-add (or by clicking any card) the full card detail modal opens.
- Team members can fill in all fields: description, steps to reproduce, expected vs actual, severity, labels, assignees, attachments, URL, due date.
- Auto-metadata (browser, OS, viewport, user agent) is captured from the team member's own browser at the time of submission — same as client flow.

#### Integration push decision
- Inside the card detail modal, a **"Push to integration"** section shows available integrations for that board (ClickUp, GitHub, GitLab).
- Each integration has its own **push toggle/button** — the team member decides which ones to push to, at the time of adding or any time after.
- This overrides the board-level auto-push setting on a per-card basis for team-created cards.
- Push status (pending / pushed / failed + retry) is shown per integration on the card, and logged in card activity history.

#### Distinction from client-submitted bugs
- Cards added by team members are tagged internally as `source: internal` vs `source: client` (visible in card detail and filterable on the board).
- No simplified "client" form — team members always have access to all fields.

### 5.4 Lists (Columns)

- Members can add new lists/columns directly from the board view.
- Lists have a name and an order index.
- Reordering a list updates all cards in it visually; no data loss.
- Deleting a list is only permitted when empty (or with a confirmation + move-cards-first prompt).
- Lists can be **archived** (see §5.14) — hidden from the board immediately, all cards inside are also archived together. Restoring a list restores all its cards.

#### List actions menu
Every column has a `⋯` menu that opens a **"List actions"** panel. Available actions:

| Action | Who can use | Notes |
|--------|-------------|-------|
| Add card | Team + Owner | Opens quick-add inline |
| Copy list | Team + Owner | Duplicates list with all cards (copies cards, not comments/history) |
| Move list | Team + Owner | Move to a different board the user has access to |
| Move all cards in this list | Team + Owner | Bulk move all cards to another list on this board |
| Sort by | Team + Owner | Sort cards by: Date created / Due date / Card name / Priority / Severity |
| Watch | All members | Subscribe to notifications for any activity in this list |
| Archive this list | Team + Owner | Archives list + all cards inside (undo available) |
| Archive all cards in this list | Team + Owner | Archives only the cards, list remains visible and empty |

#### List automation rules
An **"Automation"** section within the List actions panel allows Board Owner and Team members to configure simple rule-based triggers for that list. Rules are per-list.

**Available triggers and actions:**

| Trigger | Available actions |
|---------|------------------|
| When a card is added to this list | Assign a member / Set due date / Move to another list / Apply label |
| Every day (at a set time) | Sort cards by due date / Sort by priority / Sort by date created |
| Every Monday (at a set time) | Same sort options as above |
| Create a custom rule | Trigger + condition + action (basic if-this-then-that builder) |

**Custom rule builder:**
- Trigger: Card added / Card moved in / Due date reached / Label added / Member assigned
- Condition (optional): Priority equals / Severity equals / Label is / Assignee is
- Action: Move card to list / Apply label / Assign member / Send notification / Set due date

Rules are stored per-list and shown as a summary list in the Automation section. Each rule can be enabled/disabled or deleted. Rules execute server-side; failures are logged silently (no user-facing error unless the Board Owner checks the automation log).

> Note: Automation rules are a "nice to have" in MVP. If build time is constrained, the sort rules (daily/weekly sort) should be deprioritised first; the "when a card is added" trigger is the highest-value automation.

### 5.5 Board Sharing & Invites

#### Invite by email
- **Board Owner and Team members** can invite new members to a board. Client-role members cannot invite.
- Invite flow opens a **"Share board" modal** with:
  - Email + name input field with role dropdown (Team member / Client) + Send button in one row.
  - **Autopopulate from platform users:** as the inviter types, a dropdown shows matching registered users (by name or email). Selecting one prefills the field. Unknown emails are treated as new external invites.
  - A **"Board members (N)"** tab showing the current member list with each member's avatar, name, handle, and a per-member role dropdown (Admin / Member). Role can be changed inline.
  - A **"Join requests"** tab (see below).
- Invited user receives an **email with a unique invite link** (time-limited, 72 hours).
- If the invited email already has an account → link logs them in and adds them to the board.
- If new → link takes them to a registration page (name + password), then adds them to the board.
- Board owner can revoke pending invites and remove existing members.
- **Member limit per board** is set by the Super Admin. No one can invite beyond this limit — the invite button is disabled with a clear message when the limit is reached.

#### Share board via link
- Board Owner can generate a **shareable board link** from the Share board modal.
- Link options: View only / Can comment / Full member access — selectable before generating.
- Generated link is displayed with a copy button.
- Link can be revoked at any time by the Board Owner (all access via that link is immediately removed).
- Share link is a separate mechanism from email invites — no account required for view-only links (client convenience).
- Share link usage is logged in board activity.

#### Join requests
- If a board has share-link access enabled, users who arrive via the link and want edit/member access can submit a **join request**.
- Join requests appear in the "Join requests" tab of the Share board modal.
- Board Owner and Team members with invite permission can approve or decline each request.
- Approved request → user added as the role the Board Owner selects at approval time.
- Declined request → user notified by email.
- Join request triggers an in-app + email notification to the Board Owner.

### 5.6 Dynamic Labels

- Labels are created per-board (not global).
- Each label has: name + colour (from a preset palette or custom hex).
- Board owner and team members can create, edit, delete labels.
- Multiple labels can be assigned to one card.
- Labels are filterable on the board view.
- Deleting a label removes it from all cards on that board.

### 5.7 Assignees & @Mentions

- Multiple members can be assigned to a card.
- On assignment: the assigned user receives an **email notification** and an **in-app notification** (bell icon) with a direct link to the card.
- In comments and description: typing `@username` triggers a mention dropdown.
- On @mention: the mentioned user receives an **email notification** and an **in-app notification**.
- Notifications include: board name, card title, who performed the action, direct card link.

### 5.8 Card Activity History

Every action on a card is logged and displayed in a chronological activity feed on the card detail view. Tracked actions include:

- Card created (by whom)
- Card moved (from column → to column, by whom)
- Title / description / field edited (by whom, what changed)
- Label added / removed (by whom)
- Member assigned / unassigned (by whom)
- Attachment added / removed (by whom)
- Due date set / changed / removed (by whom)
- Comment added (by whom)
- Card pushed to ClickUp / Git (by whom, external ID)
- Card archived / deleted

Each history entry shows: **actor name, action description, timestamp** (relative + absolute on hover).

### 5.9 Comments & Chat

The comment section is a **first-class panel** in the card detail view, displayed below the activity history.

#### Comment composer
- Rich text input supporting: plain text, @mentions (autocomplete dropdown of board members), and **file/image attachments** (drag-and-drop or browse).
- Submit via button or `Ctrl+Enter`.
- Attachments on comments are stored and displayed inline (image preview for images; file icon + name + size for other types).

#### Comment display
- Comments ordered chronologically, oldest at top, newest at bottom.
- Each comment shows: **avatar, member name, timestamp** (relative + absolute on hover), comment body, inline attachments.
- Unread comments since last visit highlighted with a subtle indicator.

#### Edit comment
- Author of a comment can **edit** it at any time.
- Edited comments show an `(edited)` label with the edit timestamp on hover.
- Edit is tracked in card activity history: "X edited their comment."

#### Delete comment
- Author and Board Owner can delete a comment.
- Deleted comments show a placeholder: *"This comment was deleted."* (soft delete — preserves thread continuity).
- Deletion tracked in activity history.

#### Reply to comment
- Any board member can **reply** to a specific comment — creates a threaded reply nested under the parent.
- Reply shows the parent comment excerpt for context.
- @mentions work inside replies.
- File attachments allowed on replies.
- Replying to a comment triggers an **email notification** and an **in-app notification** to the original comment author.

#### Notifications from comments
- New comment on a card you are assigned to → all assignees notified via email + in-app.
- @mention in a comment or reply → mentioned user notified via email + in-app.
- Reply to your comment → original comment author notified via email + in-app.

#### Permissions
- All board members (Team + Client) can post, edit their own, and reply.
- Only Board Owner or comment author can delete.

### 5.10 Notifications — Email + In-App (All Actions)

Every significant action in the app fires **both an email notification and an in-app notification** (bell icon) to all relevant board members. In-app notifications appear instantly; emails are queued and sent promptly.

#### Full notification trigger matrix

| Trigger | Who gets notified | Channels |
|---------|------------------|----------|
| **Card & assignment** | | |
| New card created on a board | All board members (Team + Owner) | In-app |
| Card assigned to you | Assignee | Email + In-app |
| Card unassigned from you | Unassigned member | Email + In-app |
| Card moved to a new column | All card assignees | In-app |
| Card due date set / changed | All card assignees | In-app |
| Card overdue (past due date) | All card assignees + Board Owner | Email + In-app |
| Card archived | All card assignees | In-app |
| Card restored from archive | All card assignees | In-app |
| Card deleted permanently | All card assignees | Email + In-app |
| **Comments & mentions** | | |
| New comment on a card you're assigned to | All assignees | Email + In-app |
| @mention in a comment, reply, or description | Mentioned member | Email + In-app |
| Reply to your comment | Original comment author | Email + In-app |
| Comment deleted on a card you're assigned to | All assignees | In-app |
| **Labels & fields** | | |
| Label added to a card you're assigned to | All assignees | In-app |
| Priority / severity changed on your card | All assignees | In-app |
| **Board membership** | | |
| Board invite sent | Invited email address | Email |
| You were added to a board | New member | Email + In-app |
| You were removed from a board | Removed member | Email + In-app |
| New member joined your board | Board Owner + all Team members | In-app |
| Join request received | Board Owner | Email + In-app |
| Join request approved | Requesting user | Email + In-app |
| Join request declined | Requesting user | Email + In-app |
| **Integrations** | | |
| Card successfully pushed to ClickUp / Git | Actor (confirmation) | In-app |
| Integration push failed | Board Owner + card reporter | Email + In-app |
| **Checklists** | | |
| Checklist item assigned to you | Assigned member | In-app |
| All checklist items completed on your card | All card assignees | In-app |
| **Admin / system** | | |
| Your account was created by admin | New user | Email |
| Password reset requested | Requesting user | Email |
| Member limit reached on your board | Board Owner | Email + In-app |

#### Notification content
Every notification (email and in-app) includes:
- **Who** performed the action (avatar + name)
- **What** happened (plain-language description)
- **Where** — board name + card title
- **Direct link** to the card or board
- **Timestamp**

#### Delivery rules
- In-app notifications appear instantly in the bell dropdown for all relevant members currently logged in, and are stored in DB for members who are offline.
- Email notifications are queued — members who are actively using the app still receive in-app only (no duplicate email while in-session). Email fires after a 2-minute inactivity window to avoid spam.
- **Clients** receive the same in-app and email notifications scoped to their own board only.
- All notification channels are user-configurable per event type in Profile → Notification Settings (email / in-app / both / off).
- Default for all users: both email + in-app for all events.

> Note: "In-app only" events are lower-signal updates (e.g. card moved, label added) that don't warrant an email but are still visible in the notification centre.

### 5.11 Date & Time Display

- Created at and updated at are shown on every card in board view (relative time).
- Card detail view shows full absolute timestamp alongside relative.
- Activity history entries all carry timestamps.
- Due dates shown on card face; overdue cards highlighted (e.g. red border).
- All times stored in UTC; displayed in board timezone (configurable per board, default UTC+1 for German clients).

#### Date picker panel

The date picker opens as a panel from the card detail view (via `+ Add → Dates` or clicking the existing due date). It contains:

- **Calendar view** — month grid (Mon–Sun columns), with navigation arrows for previous/next month and previous/next year. Today's date highlighted. Selected dates highlighted in accent colour.
- **Start date** — optional. Checkbox to enable + date input (D/M/YYYY format). Setting a start date shows a date range highlighted on the calendar.
- **Due date** — checkbox to enable + date input + time dropdown (HH:MM, 15-min intervals). Due date is shown on the card face once set.
- **Recurring schedule** — dropdown: Never / Daily / Weekly / Monthly / Yearly. When a recurring card is marked complete, a new due date is automatically set based on the schedule and the card is moved back to its original column.
- **Save / Remove** buttons at the bottom of the panel.

#### Overdue behaviour
- A card past its due date (and not in a closed column) is flagged overdue: red due date badge on card face, red left border on the card, included in the stats bar overdue count.
- Overdue cards trigger email + in-app notification to all assignees (see §5.10).

### 5.12 Board Search (My Boards)

- Every logged-in user lands on a **"My Boards"** home screen after login.
- Shows all boards the user is a member of or owns, displayed as a card grid.
- **Real-time search bar** at the top filters boards by name as the user types.
- Each board card shows: board name, owner name, member count, open bug count, last activity timestamp.
- Board Owner and Team members see a "Manage Members" shortcut directly on the board card.
- Boards sorted by last activity (most recent first) by default.

### 5.13 Board & Card Filters

Filters appear as a **collapsible filter toolbar** above the Kanban columns on the board view.

#### Available filters

| Filter | Type | Options |
|--------|------|---------|
| Label | Multi-select | All labels defined on this board |
| Priority | Multi-select | Urgent / High / Normal / Low |
| Severity | Multi-select | Critical / High / Medium / Low |
| Assigned to | Multi-select | All board members + "Assigned to me" shortcut |
| Reporter | Multi-select | All board members |
| Source | Single-select | All / Internal / Client |
| Due date | Date range | Overdue / Due today / Due this week / Custom range |
| Created date | Date range | Custom range picker |
| Has attachments | Toggle | Cards with attachments only |
| Unassigned | Toggle | Cards with no assignee only |

#### Filter behaviour
- Multiple filters combine with **AND** logic (narrows results).
- Active filter count shown on the toolbar button (e.g. "Filters: 3").
- Cards that don't match are dimmed — matching cards stay full opacity.
- **Clear all** button resets to full board view instantly.
- Filter state is preserved per browser session (not saved to DB for MVP).

### 5.14 Archive

#### Archiving cards
- Any Team member or Board Owner can archive a card via card detail menu (⋯ → Archive).
- Archived cards are **immediately hidden** from the board and column counts.
- A **5-second undo toast** appears: "Card archived. Undo" — clicking Undo restores the card to its original column and position instantly.
- Archive action logged in card activity history.

#### Archiving lists
- Board Owner can archive an entire list via list menu (⋯ → Archive List).
- All cards inside are archived together with the list.
- Same 5-second undo toast behaviour.
- Logged in board-level activity.

#### Archive section (consolidated view)
- Accessible from board header: **"View Archive"** button, visible to all board members.
- Two tabs: **Archived Cards** and **Archived Lists**.
- Each entry shows: name, original list/board, who archived it, when archived.
- **Search** within archive by card title.
- **Restore** — returns card to original list if it still exists; prompts to pick a list if the original was also archived.
- **Delete permanently** (Board Owner only) — confirmation dialog required. Removes all attachments, comments, and history permanently.
- Client-role members can view the archive but cannot restore or permanently delete.

---

### 5.15 Onboarding & Empty States

#### First-board setup wizard
- When a user creates their very first board, a 3-step modal wizard launches automatically:
  - **Step 1 — Name your board:** board name + optional description.
  - **Step 2 — Set up columns:** pre-filled default columns (Backlog, Open, In Progress, Review, Closed) with option to rename, reorder, or remove before confirming.
  - **Step 3 — Invite your first member:** email input with role selector (Team / Client). Skippable.
- Wizard only fires for the first board. All subsequent boards open directly.

#### Empty states
Every major view has a purposeful empty state — not a blank page:

| View | Empty state message + CTA |
|------|--------------------------|
| My Boards (no boards) | "You're not on any boards yet. Create your first board →" |
| Board (no cards in column) | "No bugs here. Drag a card in or click + Add card" |
| Archive (nothing archived) | "Nothing archived yet. Cards and lists you archive will appear here." |
| Notifications (none) | "You're all caught up. No new notifications." |
| Search results (no match) | "No cards match '[query]'. Try different keywords or clear filters." |

#### Client welcome email
- Triggered when a client accepts a board invite and completes registration.
- Content: what the board is for, how to submit a bug (step-by-step in plain language), how to track status, who to contact for help.
- Branded with the board name and the inviting team member's name.

### 5.16 In-App Notification Centre

- **Bell icon** in the top navbar, persistent across all views.
- **Unread count badge** on the bell — shows number of unread notifications, capped at "99+" display.
- Clicking the bell opens a **notification dropdown panel** (not a full page — keeps context).
- Panel shows the last 20 notifications with:
  - Event type icon (assign, unassign, move, comment, mention, reply, label, checklist, invite, push, push failure, archive, member joined/removed, overdue, limit reached)
  - Short description: "Gaurav assigned you to [Card Title] on [Board Name]"
  - Relative timestamp ("3 min ago")
  - Unread indicator (blue dot on left edge)
  - Click → navigates directly to the card/board
- **Mark all as read** button at the top of the panel.
- Individual notification can be dismissed (×).
- "View all notifications" link → dedicated full notifications page with pagination and filter by type.
- Notifications are stored in DB (`Notification` entity, already in data model).
- Real-time delivery via polling every 30s for MVP; upgradeable to WebSocket in Phase 2.

#### Notification preferences (per user)
- Accessible from user profile → Notification Settings.
- Per event group, toggle channel: **Email + In-app / In-app only / Email only / Off**.
- Event groups configurable:
  - Card assigned / unassigned to me
  - Card overdue
  - Card deleted permanently
  - @mention anywhere
  - New comment on my card
  - Reply to my comment
  - Board membership changes (added / removed)
  - Integration push results
  - Checklist item assigned to me
  - Member limit reached (Board Owner only)
- Default for all users: **Email + In-app** for all events.

### 5.17 Global Search

- **Search bar** in the top navbar, accessible from any screen.
- Keyboard shortcut `/` focuses the search input instantly.
- Searches across all cards the logged-in user has access to (scoped by board membership).
- Search matches: card title, description, comment content, label name.
- Results grouped by board, showing: card title, current column, priority badge, assignee avatars, last updated.
- Clicking a result navigates directly to the card detail modal.
- **Recent searches** shown when the search bar is focused with no input (last 5 searches, stored in browser localStorage).
- Search is debounced (300ms) — no search-on-every-keystroke.
- Empty state: "No cards found for '[query]'" with a suggestion to check spelling or try broader terms.

### 5.18 Keyboard Shortcuts

A global keyboard shortcut layer for power users (primarily the QA/dev team):

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `/` | Focus global search |
| `N` | Open quick-add card (in the first column of the current board) |
| `F` | Toggle filter toolbar open/closed |
| `Esc` | Close modal / card detail / dropdown / command palette |
| `?` | Open keyboard shortcut reference overlay |
| `B` | Go to My Boards home |
| `A` | Open archive panel |

- Shortcuts are disabled when focus is inside a text input or textarea.
- A shortcut reference overlay (`?`) lists all available shortcuts in a modal.
- Shortcuts only apply to the main app — not the Admin Panel.

### 5.19 Board & Card UX Enhancements

#### Card cover image
- If a card has one or more image attachments, a **"Set as cover"** option appears in the attachment section of the card detail.
- The chosen image renders as a cover banner at the top of the card face in board view.
- Improves visual scannability for screenshot-heavy bug reports.
- Cover can be removed via the card detail menu.

#### Card count per column
- Each column header shows a live count in muted text: e.g. `In Progress (7)`.
- Count updates immediately on drag-and-drop — no refresh needed.
- Count excludes archived cards.

#### Bulk actions
- Multi-select cards on the board by holding `Shift` + clicking, or via a checkbox that appears on card hover.
- A **bulk action bar** slides up from the bottom when 2+ cards are selected, showing:
  - Move to column (dropdown)
  - Assign member (dropdown)
  - Change priority (dropdown)
  - Apply label (dropdown)
  - Archive selected
  - Clear selection
- Bulk actions are logged per card in individual activity histories.
- Available to Team members and Board Owner only — not clients.

#### Card copy / duplicate
- Available in card detail menu (⋯ → Duplicate card).
- Duplicates: title (prefixed "Copy of..."), description, steps, severity, priority, labels, attachments list (not the files themselves).
- Does not copy: comments, activity history, assignees, external refs.
- Duplicate is created in the same column as the original, at the bottom.

#### Checklist / subtasks on card
- Optional checklist block inside card detail — added via "+ Add checklist" button.
- Each checklist item: checkbox + text label + optional assignee.
- Checking an item logs it in activity history.
- **Progress bar** shown on card face in board view (e.g. "3/5 ✓") when a card has a checklist.
- Multiple checklists per card allowed (each with its own title).

#### Column WIP limit (work-in-progress limit)
- Board Owner can set an optional max card count per column via column settings (⋯ → Set limit).
- When a column reaches its limit: column header turns amber, a warning tooltip appears ("WIP limit reached: 5/5").
- Dragging a card into a full column shows a warning but still allows the move (soft limit — does not block).

#### Board summary stats bar
- Pinned bar directly below the board header, always visible.
- Shows live counts for the current board:
  - Total open cards
  - By severity: Critical (n) · High (n) · Medium (n) · Low (n)
  - Overdue cards (past due date)
  - Unassigned cards
- Counts are clickable — clicking applies the corresponding filter to the board instantly.
- Stats bar can be collapsed by the user (preference saved to localStorage).

#### Board-level activity feed
- Accessible from board header: **"Activity"** button / side panel.
- Shows a chronological log of all actions across all cards on the board (not just one card).
- Each entry: actor avatar, action description, card name (linked), timestamp.
- Filterable by actor (member).
- Useful for async standups and client transparency.

#### Export bugs to CSV
- Available in board header: **"Export"** button (Board Owner and Team members only).
- Exports all cards matching the current active filters (or all cards if no filters).
- CSV columns: ID, title, column, severity, priority, labels, assignees, reporter, source, due date, created at, updated at, ClickUp link, Git issue link.
- Filename: `[board-name]-bugs-[date].csv`.

#### Profile page
- Accessible from user avatar → Profile.
- Fields: display name, email (read-only), avatar upload or initials + colour picker, change password (requires current password).
- Changes saved immediately with confirmation toast.
- Delete account option (with confirmation) — soft delete, anonymises their data on existing cards.

#### Forgot password / reset flow
- "Forgot password?" link on the login screen.
- User enters email → receives a time-limited reset link (valid 1 hour).
- Reset link leads to a set-new-password form.
- Expired or used links show a clear error with a "Request a new link" option.
- Password reset is logged as a security event (not shown to user, but stored server-side).

#### Session timeout warning
- When the JWT access token is within 5 minutes of expiry, a non-intrusive toast appears: "Your session is about to expire. Stay logged in?"
- "Stay logged in" silently refreshes the token via the refresh token endpoint.
- "Log out" clears session immediately.
- If the user is mid-form (e.g. writing a bug report), the form content is preserved in `sessionStorage` and restored after token refresh — no data loss.

### 5.20 Dashboard & Reports

A dedicated **Reports** tab accessible from the board header and from the global My Boards home screen. Visible to **Board Owner and Team members only** — clients do not see this section.

---

#### A. Per-Board Dashboard

Accessed via the **"Reports"** tab inside each board. Shows analytics scoped to that board only.

##### Stat cards (top row)
Always visible, live counts updating in real time:

| Stat card | What it shows |
|-----------|--------------|
| Total bugs | All non-archived cards on this board |
| Open bugs | Cards not in a "Closed" or "Won't Fix" column |
| Resolved this week | Cards moved to a closing column in the last 7 days |
| Overdue | Cards past their due date and not closed |
| Unassigned | Cards with no assignee |
| Avg. resolution time | Average days from card creation to close (all time) |

##### Charts & breakdowns

**1. Bugs by severity**
- Donut chart: Critical / High / Medium / Low — count + percentage per slice.
- Colour-coded consistently with severity badges used on cards.

**2. Bugs by priority**
- Donut chart: Urgent / High / Normal / Low — count + percentage per slice.
- Colour-coded consistently with priority flag colours used on cards.

**3. Bugs by column (status)**
- Horizontal bar chart: one bar per column, length = card count.
- Shows current distribution across the workflow — highlights bottlenecks visually.

**4. Bugs by label**
- Horizontal bar chart: one bar per label defined on the board.
- Bars use the label's own colour.
- Labels with zero cards are hidden by default (toggle to show).

**5. Bugs by assignee**
- Horizontal bar chart: one bar per board member who has at least one assigned card.
- Shows total assigned, split into open vs closed (stacked bar).
- "Unassigned" shown as the last bar.

**6. Bug trend over time**
- Line chart: X axis = date (last 30 days by default), Y axis = count.
- Two lines: **Opened** (new cards created) vs **Closed** (cards moved to closing column).
- Date range selector: last 7 days / 30 days / 90 days / custom range.
- A flat or rising "Opened" line crossing above "Closed" = backlog growing — useful signal for the team.

**7. Source breakdown**
- Simple stat card + small donut: Internal (team-added) vs Client-submitted — count + %.

##### Filters on per-board dashboard
All charts respond to a shared filter bar at the top of the Reports tab:
- Date range (creation date)
- Assignee (filter to one member)
- Label
- Source (internal / client)

Applying a filter updates all charts simultaneously.

##### Export
- **Export as PDF** — snapshot of all charts + stat cards as a single-page report. Filename: `[board-name]-report-[date].pdf`.
- **Export data as CSV** — raw card data behind the current dashboard view (same columns as the board CSV export).

---

#### B. Global Dashboard

Accessed from the **My Boards home screen** via a **"Global Reports"** button in the top navbar. Visible to Team members and Board Owners only (scoped to boards they are a member of). Super Admins see all boards.

##### Global stat cards (top row)

| Stat card | What it shows |
|-----------|--------------|
| Total boards | All boards the user is a member of |
| Total open bugs | Across all accessible boards |
| Critical bugs open | Critical severity, not closed, across all boards |
| Overdue bugs | Across all boards |
| Resolved this week | Across all boards |
| Most active board | Board with most card activity in last 7 days |

##### Global charts & breakdowns

**1. Bugs per board**
- Horizontal bar chart: one bar per board, showing open card count.
- Bars clickable — clicking navigates to that board's per-board dashboard.

**2. Global severity breakdown**
- Stacked bar chart: one bar per board, stacked by severity (Critical / High / Medium / Low).
- Lets team see at a glance which board has the most critical bugs.

**3. Global priority breakdown**
- Stacked bar chart: one bar per board, stacked by priority.

**4. Global bug trend**
- Line chart: opened vs closed across all boards combined.
- Date range: last 7 / 30 / 90 days / custom.

**5. Top assignees (global)**
- Horizontal bar chart: team members ranked by number of open bugs assigned across all boards.
- Useful for workload balancing — spot overloaded team members.

**6. Label usage across boards**
- Bar chart: most-used labels across all boards (by card count).
- Helps identify recurring bug categories platform-wide.

##### Filters on global dashboard
- Board selector (multi-select — filter down to specific boards)
- Date range
- Severity
- Priority

##### Export
- **Export global report as PDF** — all global charts + stat cards.
- **Export as CSV** — aggregated data across all selected boards.

---

#### Access summary

| Feature | Super Admin | Board Owner | Team Member | Client |
|---------|-------------|-------------|-------------|--------|
| Per-board dashboard | ✅ (all boards) | ✅ (own boards) | ✅ (member boards) | ❌ |
| Global dashboard | ✅ (all boards) | ✅ (own boards only) | ✅ (member boards only) | ❌ |
| Export PDF / CSV | ✅ | ✅ | ✅ | ❌ |

### 5.21 Public Pages & Plans (Phase 0)

#### Landing page (`/`)
Public, no login required. Purpose: introduce BugTrack to prospective customers and drive sign-ups.

Sections (top to bottom):
- **Hero** — headline, sub-headline, primary CTA button ("Start free" → `/pricing`), secondary CTA ("See it in action" → anchor scroll to demo).
- **Features overview** — 3–4 key feature highlights with icon + title + one-line description (Kanban board, bug tracking, team collaboration, integrations).
- **Screenshots / demo** — static or animated screenshot of the board view.
- **Pricing teaser** — brief pricing tier summary with a "View pricing" link.
- **Footer** — links: Pricing, Login, Contact.

No login is required. The navbar shows only: BugTrack logo, "Pricing" link, "Log in" button.

#### Pricing page (`/pricing`)
Public. Shows plan tiers side by side.

| Tier | Target | Key limits |
|------|--------|------------|
| **Free** | Indie / small teams | 1 board, 3 members, no integrations |
| **Pro** | Growing teams | 10 boards, 25 members, ClickUp + GitHub integrations |
| **Business** | Agencies / larger teams | Unlimited boards, unlimited members, all integrations, priority support |
| **Enterprise** | Custom | Custom pricing, SLA, SSO (Phase 2) |

Each plan card shows:
- Plan name + monthly price (per seat or flat)
- Feature list (checkmarks)
- Primary CTA button: "Get started" (→ sign-up flow) or "Contact sales" (Enterprise)
- "Current plan" badge if user is logged in and on that plan

Feature flag lookup powered by `PlanFeatureFlag` table in the DB. The pricing page content can be managed via `SystemConfig` keys by Super Admin.

#### Upgrade screen (`/upgrade`, in-app)
Accessible when a logged-in user hits a plan limit (e.g. tries to create a board beyond their plan's board limit). Also accessible from Profile → Plan.

Shows:
- Current plan + usage summary (boards used / allowed, members used / allowed, integrations enabled).
- Plan comparison table (same as pricing page, condensed).
- "Upgrade to Pro" / "Upgrade to Business" CTAs.
- For MVP: CTA links to a contact/sales email or external checkout. No in-app payment processing.

#### Sign-up flow
Since self-registration without an invite is not permitted for the main app, the sign-up flow from the landing/pricing page creates a **pending account** (unverified state) and sends an OTP.

Steps:
1. `/signup` — email + full name + password form. Submits to `POST /api/v1/auth/signup`. Account created in `is_verified: false` state.
2. `/verify-email` — 6-digit OTP input. Submits to `POST /api/v1/auth/verify-email`. On success, account activated, user logged in (JWT issued), redirected to My Boards (empty state + first-board wizard).
3. Resend OTP link on `/verify-email` → `POST /api/v1/auth/resend-otp` (rate-limited).

> Note: Invite-based registration still works as before — invited users skip the signup form but still go through email verification if their account is new.

#### 2FA setup (`/setup-2fa`)
Triggered automatically after first login if admin has enforced 2FA for the organisation, or accessed voluntarily from Profile → Security.

Steps:
1. Backend returns a TOTP secret + QR code URL (`POST /api/v1/auth/setup-2fa`).
2. Frontend renders the QR code (using a library or `<img>` from the OTP URI). User scans with their authenticator app.
3. User enters the first TOTP code to confirm → `POST /api/v1/auth/confirm-2fa`.
4. On success: backup codes displayed once (user must acknowledge). 2FA enabled on account.

#### 2FA challenge (`/2fa`)
Shown after successful email + password entry when the account has 2FA enabled.

Accepts one of:
- TOTP code (6 digits, from authenticator app).
- Email OTP (fallback — "Send code to email" link triggers a fresh OTP).
- Backup code (9-character alphanumeric, one-time use).

On success → `POST /api/v1/auth/login-2fa` → full JWT issued → redirect to app.

#### Admin settings (`/admin/settings` — Super Admin only)
New tab in the Admin Panel for managing platform-wide configuration.

| Key | Type | Description |
|-----|------|-------------|
| `signup_allowed` | bool | Allow public sign-ups (true) or invite-only (false) |
| `2fa_required` | bool | Force all users to set up 2FA |
| `free_plan_board_limit` | int | Max boards on free plan |
| `free_plan_member_limit` | int | Max members per board on free plan |
| `pro_plan_board_limit` | int | Max boards on pro plan |
| `pro_plan_member_limit` | int | Max members per board on pro plan |
| `maintenance_mode` | bool | Show maintenance banner site-wide |
| `support_email` | string | Email shown on pricing/upgrade pages |

Changes are written to `SystemConfig` table and take effect immediately. All changes logged in `AdminAuditLog`.

#### New data model entities (Phase 0)

**`Plan`**
| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| name | VARCHAR(50) | free / pro / business / enterprise |
| display_name | VARCHAR(100) | |
| price_monthly | DECIMAL(10,2) | |
| price_yearly | DECIMAL(10,2) | |
| is_active | BOOL | |

**`PlanFeatureFlag`**
| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| plan_id | FK → Plan | |
| feature_key | VARCHAR(100) | e.g. "integrations", "unlimited_boards" |
| is_enabled | BOOL | |
| limit_value | INT nullable | e.g. board count limit |

**`SystemConfig`**
| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| config_key | VARCHAR(100) UNIQUE | |
| config_value | TEXT | JSON-encoded |
| updated_by_id | FK → User | Super Admin who last changed it |
| updated_at | DATETIME UTC | |

**`LoginAttempt`**
| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| email | VARCHAR(255) | |
| ip_address | VARCHAR(45) | IPv4 or IPv6 |
| success | BOOL | |
| attempted_at | DATETIME UTC | |

**`AdminAuditLog`**
| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| admin_id | FK → User | |
| action | VARCHAR(100) | e.g. "update_system_config", "disable_2fa" |
| target_type | VARCHAR(50) | e.g. "User", "SystemConfig" |
| target_id | BIGINT nullable | |
| detail_json | TEXT | Before/after snapshot (JSON) |
| performed_at | DATETIME UTC | |

**User model additions (new columns on existing `users` table):**
| Field | Type | Notes |
|-------|------|-------|
| is_verified | BOOL | False until OTP confirmed |
| email_otp_hash | VARCHAR(255) nullable | bcrypt hash of current OTP |
| email_otp_expires_at | DATETIME UTC nullable | |
| email_otp_attempts | SMALLINT | Incremented per failed attempt |
| totp_secret_encrypted | TEXT nullable | Fernet-encrypted TOTP secret |
| two_fa_enabled | BOOL | Default false |
| backup_codes_hash | TEXT nullable | JSON array of bcrypt-hashed backup codes |
| plan_id | FK → Plan nullable | Null = free plan |
| locked_until | DATETIME UTC nullable | Set on lockout |

#### New API endpoints (Phase 0)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/signup` | Create unverified account, send OTP |
| `POST` | `/api/v1/auth/verify-email` | Submit OTP → activate account, issue JWT |
| `POST` | `/api/v1/auth/resend-otp` | Resend OTP (rate-limited) |
| `POST` | `/api/v1/auth/setup-2fa` | Generate TOTP secret + QR URI |
| `POST` | `/api/v1/auth/confirm-2fa` | Verify first TOTP, generate backup codes |
| `POST` | `/api/v1/auth/login-2fa` | Submit TOTP/email OTP/backup code → issue full JWT |
| `GET` | `/api/v1/admin/settings` | Fetch all `SystemConfig` values |
| `PATCH` | `/api/v1/admin/settings` | Update one or more config keys (audit logged) |

---

### 5.22 Card Watchers (Phase 15)

Any board member can subscribe to a specific card to receive all its activity notifications, without being assigned to it.

#### Watch / unwatch
- A **Watch** toggle button appears in the right sidebar of the card detail modal (below the assignees section).
- Clicking **Watch** subscribes the current user to the card. The button changes to **Watching** with a filled eye icon.
- Clicking **Watching** unsubscribes. Confirmation is not required.
- Watching is scoped to the card — a user can watch a card on a board they're a member of regardless of whether they're assigned.

#### Watcher display on card face
- If a card has watchers (excluding its assignees), a subtle eye icon with a count appears in the bottom-right area of the card face in board view: `👁 3`.
- Hovering the icon in the card detail shows a small list of watcher names.

#### Notification behaviour
- Watchers receive **all** the same in-app notifications as assignees:
  - Card moved to a new column
  - Comment added
  - @mention in a comment or description
  - Due date changed
  - Priority / severity changed
  - Card archived or restored
- Watchers do **not** receive email notifications by default; they can opt in via their notification preferences (new event group: "Cards I'm watching").
- When a watcher is also an assignee, they are not double-notified.

#### Data model addition
New entity: **`CardWatcher`**

| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| card_id | FK → Card | |
| user_id | FK → User | |
| created_at | DATETIME UTC | |

Unique constraint: `(card_id, user_id)` — one row per user per card.

#### API endpoints
- `POST /api/v1/cards/:id/watch` — subscribe the current user (201 Created or 200 if already watching).
- `DELETE /api/v1/cards/:id/watch` — unsubscribe the current user.
- `GET /api/v1/cards/:id/watchers` — list all watchers (user id, full_name, initials_color).

The `is_watching` field (boolean) and `watcher_count` (integer) are included in the existing card face response so the board view can show the eye icon without extra calls.

---

### 5.22 Card Templates (Phase 15)

Board owners and team members can save reusable bug card templates to speed up structured bug reporting. Templates pre-fill fields when creating a new card.

#### What a template stores
| Field | Notes |
|-------|-------|
| Name | Display name for the template (e.g. "Crash bug", "UI glitch", "Performance issue") |
| Description | Pre-filled description body (Markdown) |
| Severity | Optional default severity |
| Priority | Optional default priority |
| Checklist items | JSON array of item texts — added to a new checklist on the created card |

Templates do **not** store: assignees, labels, attachments, due dates (those vary per card instance).

#### Creating a template
Two paths:
1. **From scratch** — In the board header, a new "Templates" button opens the **Template Manager** modal. A "New template" form collects name, description, severity, priority, and checklist items.
2. **Save current card as template** — Card detail menu (⋯) has a "Save as template" option. Opens a prompt for the template name; all relevant fields are pre-filled from the current card.

#### Using a template
- Every column's **"+ Add card"** button shows a secondary **"Use template ▾"** dropdown next to the quick-add input (visible on hover).
- Clicking the dropdown lists all board templates by name.
- Selecting a template opens the full card detail modal (not quick-add) with all template fields pre-populated. The user completes any remaining fields and saves.

#### Template management
- **Template Manager** modal accessible from the board header ("Templates" button, visible to Team + Owner).
- Lists all templates for the current board as cards: name, severity badge, description preview, checklist count.
- Actions per template: **Edit** (opens edit form), **Delete** (confirmation required), **Use** (opens new card modal with template pre-filled).
- Clients cannot see or use templates.

#### Data model addition
New entity: **`CardTemplate`**

| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| board_id | FK → Board | |
| name | VARCHAR(255) | Required |
| description | TEXT | Optional — Markdown |
| severity | ENUM nullable | critical / high / medium / low |
| priority | ENUM nullable | urgent / high / normal / low |
| checklist_json | JSON | Array of `{text: string}` objects |
| created_by_id | FK → User | |
| created_at | DATETIME UTC | |
| updated_at | DATETIME UTC | |

#### API endpoints
- `GET /api/v1/boards/:id/templates` — list all templates for a board (member access, client excluded).
- `POST /api/v1/boards/:id/templates` — create a template (team + owner only).
- `PATCH /api/v1/boards/:id/templates/:tid` — update a template (team + owner only).
- `DELETE /api/v1/boards/:id/templates/:tid` — delete a template (team + owner only).

---

### 5.24 Command Palette (Phase 14)

A floating, keyboard-driven launcher accessible from anywhere in the app via `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux).

#### Trigger & dismiss
- Opens with `Cmd+K` / `Ctrl+K` from any screen (board view, my boards, admin panel, notifications, etc.).
- Dismisses with `Esc` or clicking the backdrop overlay.
- Disabled when focus is inside a text editor (description, comment composer).

#### Layout
- Full-screen backdrop (dark, semi-transparent).
- Centered panel: max-width 560px, dark themed, rounded corners, shadow.
- Search input at top (auto-focused on open) with a keyboard icon label.
- Scrollable results list below the input; max height ~60vh.

#### Search & results
Results appear as the user types (debounced 150ms). Results grouped into sections:

| Section | Content | When shown |
|---------|---------|-----------|
| **Recent** | Last 10 visited boards and cards (stored in `localStorage` as `bt_recent_items`) | When input is empty |
| **Boards** | All boards the user is a member of, fuzzy-matched on board name | When input ≥ 1 char |
| **Cards** | Cards the user has access to, fuzzy-matched on title (API call, debounced 200ms) | When input ≥ 2 chars |
| **Actions** | Fixed shortcut actions (see table below) | Always shown, filtered by input |

Fixed actions always available:

| Label | Action |
|-------|--------|
| New card | Focuses the first column quick-add on the current board |
| Go to My Boards | Navigates to `/boards` |
| Go to Notifications | Navigates to `/notifications` |
| Open Archive | Navigates to `/board/:id/archive` (current board) |
| Open Reports | Navigates to `/board/:id/reports` (current board) |
| Open Keyboard Shortcuts | Opens the `?` overlay |

#### Keyboard navigation
- `↑` / `↓` — move highlight through results.
- `Enter` — execute highlighted item.
- Result items show a right-arrow icon on hover/highlight.
- Each item shows: icon, primary label, secondary context (board name for cards, member count for boards).

#### Recent item tracking
- Every time a user opens a board or card modal, the item is prepended to `bt_recent_items` in `localStorage`.
- List is capped at 10 items; duplicates are removed before prepending.
- Recent items are the first results shown when the palette opens with an empty input.

#### Implementation notes
- Pure frontend — no new API endpoint beyond the existing card search endpoint.
- Fuzzy matching on boards is client-side (boards list already loaded in `authStore` or fetched once).
- Card search calls `GET /api/v1/search?q=&per_page=8` with the existing search endpoint.
- Command palette state is a single `useState(open)` hoisted to `App.jsx`; child components call `openPalette()` via context or a module-level event.

---

### 5.25 SLA Rules Engine (Phase 14)

Per-board Service Level Agreement rules that automatically assign due dates based on severity and visually flag approaching or breached SLA windows on card faces and the stats bar.

#### SLA rule definition
- Configured per board by the Board Owner in a new **"SLA Rules"** panel accessible from the board header (⚙ Settings → SLA Rules).
- Each rule defines: `severity` (Critical / High / Medium / Low) → `hours_to_resolve` (integer, e.g. 24).
- A board can have up to 4 rules (one per severity level). Rules can be saved, edited, or deleted.
- SLA rules are optional — boards without any rules behave exactly as before.

| Default suggested rules | Hours |
|------------------------|-------|
| Critical | 24 |
| High | 72 |
| Medium | 168 (7 days) |
| Low | 336 (14 days) |

#### Auto-due-date on card creation
- When a new card is created with a `severity` set and **no due date** provided, the backend checks for an active SLA rule matching that severity on the card's board.
- If a matching rule exists: `due_date = created_at + hours_to_resolve`.
- If the user explicitly sets a due date, the SLA rule is ignored for that card.
- The auto-set due date is recorded in card activity history: "Due date auto-set from SLA rule (Critical: 24h)."

#### SLA status on card face
A small clock icon appears on the card face alongside priority/severity indicators:

| State | Icon colour | Condition |
|-------|------------|-----------|
| On track | Hidden | More than 20% of SLA window remaining |
| Warning | Amber `#ff991f` | Within the last 20% of SLA window and card not closed |
| Breached | Red `#de350b` | Past due_date and card not in a closed column |

SLA warning/breach is calculated from `created_at` and the SLA rule hours, not just the `due_date` field — so manually-set due dates don't interfere with SLA tracking.

#### Stats bar integration
- The board stats bar (§5.19) gains a new chip: **"SLA breached (n)"** shown in red when n > 0.
- Clicking the chip applies a filter: cards that are SLA-breached (past their SLA deadline and not closed).

#### Notifications
- When a card enters the warning window (last 20% of SLA time), a notification is sent to all card assignees: "Card '[title]' SLA deadline approaching — due in [X]h."
- When a card breaches SLA, a notification is sent to all assignees and the Board Owner: "SLA breached: '[title]' — [severity], [X]h overdue."
- SLA notifications are separate from the regular overdue notification and have their own event group in notification preferences.

#### Data model additions
New entity: **`SLARule`**

| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| board_id | FK → Board | |
| severity | ENUM | critical / high / medium / low |
| hours_to_resolve | INT | Must be ≥ 1 |
| created_at | DATETIME UTC | |
| updated_at | DATETIME UTC | |

Unique constraint: `(board_id, severity)` — one rule per severity per board.

#### API endpoints
- `GET /api/v1/boards/:id/sla-rules` — list all SLA rules for a board (member access).
- `POST /api/v1/boards/:id/sla-rules` — create or upsert a rule (owner only).
- `PATCH /api/v1/boards/:id/sla-rules/:rule_id` — update hours (owner only).
- `DELETE /api/v1/boards/:id/sla-rules/:rule_id` — delete a rule (owner only).

---

### 5.26 Email Digests (Phase 14)

Scheduled summary emails that keep stakeholders informed about board activity without requiring them to log in.

#### Digest content
Each digest email covers the boards the recipient is a member of (or a specific board if configured per-board). The email contains:

| Section | Content |
|---------|---------|
| **Overdue bugs assigned to me** | Cards past their due date, not closed, assigned to the recipient |
| **Newly assigned to me** | Cards assigned to the recipient since the last digest |
| **My cards with new activity** | Cards the recipient is assigned to that received a comment or field change since last digest |
| **Board snapshot** | Per-board summary: total open, critical count, resolved since last digest |

Email format: HTML (branded with accent colour, dark header) + plain-text fallback.

#### Digest frequency options
- **Daily** — sent at a configurable time (default: 08:00 in the user's timezone, falling back to UTC+1).
- **Weekly** — sent every Monday at the same configurable time.
- **Off** — no digests sent (default for existing users; opt-in).

#### User preference settings
Digest preferences are configurable per user in **Profile → Notification Settings** (added to the existing preference page):

- **Digest frequency**: Off / Daily / Weekly (radio/select).
- **Send time**: hour selector (00:00–23:00, one-hour intervals), displayed in browser local time.
- Changes take effect from the next scheduled digest run.

#### Backend
- New `DigestPreference` entity stores user preferences.
- `GET /api/v1/users/me/digest-prefs` — return current prefs.
- `PATCH /api/v1/users/me/digest-prefs` — update frequency and send time.
- `POST /api/v1/digest/trigger` (Super Admin only) — manually trigger a digest run for testing. Accepts optional `user_id` and `force: true` to bypass the "active session" suppression.
- `digest_service.py` — queries overdue/assigned/active cards per user, renders the email template, and dispatches via `email_service.py`.

#### Delivery rules
- Digest is not sent if the user has had an active session (logged in) in the last 2 hours — they've already seen the activity.
- If a user has no relevant content (nothing overdue, no new assignments, no new activity), the digest is skipped silently.
- Digest emails are marked with `List-Unsubscribe` headers for spam compliance (DSGVO).

#### Data model additions
New entity: **`DigestPreference`**

| Field | Type | Notes |
|-------|------|-------|
| id | BIGINT PK | |
| user_id | FK → User | Unique (one row per user) |
| frequency | ENUM | off / daily / weekly |
| send_hour | TINYINT | 0–23, UTC hour |
| last_sent_at | DATETIME UTC | Updated after each successful dispatch |
| created_at | DATETIME UTC | |
| updated_at | DATETIME UTC | |

---

## 6. Integrations

The app database is the **source of truth**. Integrations are one-way push (MVP).

### 6.1 ClickUp
- Config per board: API token + target Space/List.
- Push creates a ClickUp task: title, description, severity → priority, attachments.
- Stores `clickup_task_id` + URL on the card. Displayed as a clickable link.
- Push can be: manual (button on card) or automatic on card creation (configurable per board).

### 6.2 GitHub / GitLab
- Config per board: personal access token + target repository.
- Push creates an issue: title, body (description + steps), severity → label, assignee (if matched).
- Stores `issue_number` + URL on the card.
- Same manual/automatic config as ClickUp.

### 6.3 Push failure handling
- If a push fails (API error, rate limit), the bug card is **always saved locally first**.
- Failed pushes are flagged on the card with a retry button.
- Failure reason is logged in card activity history.

---

## 7. Admin Panel

Separate section of the app accessible only to Super Admins. Board owners and members cannot access it.

### 7.1 Admin capabilities
- **User management:** view all registered users, create new admin/user accounts, deactivate/reactivate accounts, reset passwords (send reset email).
- **Board member limits:** set the maximum number of members allowed per board (global default + per-board override).
- **Invite management:** view pending invites platform-wide, revoke any invite.
- **Platform overview:** total boards, total users, total bugs (read-only stats).

### 7.2 Admin cannot
- Create boards (board owners do that).
- View card content / bug details (unless also a board member).
- Manage labels, columns, or integrations (those belong to board owners).

---

## 8. Data Model (Overview)

Core entities:

| Entity | Key fields |
|--------|-----------|
| **User** | id, name, email, password_hash, global_role (super_admin / user), avatar_path, initials_colour, is_active, is_verified, email_otp_hash, email_otp_expires_at, email_otp_attempts, totp_secret_encrypted, two_fa_enabled, backup_codes_hash, plan_id (FK), locked_until, password_reset_token, password_reset_expires, created_at |
| **UserNotificationPrefs** | user_id, event_type, channel (email / in_app / both / off) |
| **Board** | id, name, owner_id, timezone, member_limit, created_at |
| **BoardMembership** | user_id, board_id, role (owner / team / client), invited_by, joined_at |
| **BoardActivityLog** | id, board_id, actor_id, action_type, card_id (nullable), meta_json, created_at |
| **Invite** | id, board_id, email, role, token (hashed), expires_at, accepted_at |
| **ShareLink** | id, board_id, token (hashed), access_level (view / comment / member), created_by, is_active, created_at, revoked_at |
| **JoinRequest** | id, board_id, user_id, share_link_id, status (pending / approved / declined), requested_at, resolved_by, resolved_at |
| **List (Column)** | id, board_id, name, position, wip_limit (nullable), created_by, is_archived, archived_by, archived_at |
| **ListAutomationRule** | id, list_id, trigger_type, condition_json (nullable), action_type, action_config_json, is_enabled, created_by, created_at |
| **Card (Bug)** | id, list_id, board_id, title, description, steps, expected, actual, severity, priority, reporter_id, start_date, due_date, due_time, recurrence_type (none/daily/weekly/monthly/yearly), cover_attachment_id (nullable), position, source (internal/client), is_archived, archived_by, archived_at, created_at, updated_at |
| **CardMeta** | card_id, browser, os, viewport, page_url, user_agent |
| **Checklist** | id, card_id, title, position |
| **ChecklistItem** | id, checklist_id, text, is_checked, assignee_id (nullable), position, checked_at, checked_by |
| **Label** | id, board_id, name, colour |
| **CardLabel** | card_id, label_id |
| **CardAssignee** | card_id, user_id |
| **Attachment** | id, card_id, uploader_id, file_path, file_type, created_at |
| **Comment** | id, card_id, author_id, body, is_edited, edited_at, is_deleted, created_at, updated_at |
| **CommentReply** | id, comment_id, author_id, body, is_edited, edited_at, is_deleted, created_at |
| **CommentAttachment** | id, comment_id, reply_id (nullable), uploader_id, file_path, file_type, created_at |
| **ActivityLog** | id, card_id, actor_id, action_type, meta_json, created_at |
| **Integration** | id, board_id, type (clickup/github/gitlab), config_json (encrypted), auto_push |
| **ExternalRef** | id, card_id, integration_type, external_id, external_url, pushed_at, push_status |
| **Notification** | id, user_id, type, card_id (nullable), board_id (nullable), message, is_read, created_at |
| **SLARule** *(Phase 14)* | id, board_id, severity (critical/high/medium/low), hours_to_resolve, created_at, updated_at — unique(board_id, severity) |
| **DigestPreference** *(Phase 14)* | id, user_id (unique FK), frequency (off/daily/weekly), send_hour (0–23 UTC), last_sent_at, created_at, updated_at |
| **CardWatcher** *(Phase 15)* | id, card_id, user_id, created_at — unique(card_id, user_id) |
| **CardTemplate** *(Phase 15)* | id, board_id, name, description, severity (nullable), priority (nullable), checklist_json, created_by_id, created_at, updated_at |
| **Plan** *(Phase 0)* | id, name (free/pro/business/enterprise), display_name, price_monthly, price_yearly, is_active |
| **PlanFeatureFlag** *(Phase 0)* | id, plan_id, feature_key, is_enabled, limit_value (nullable) |
| **SystemConfig** *(Phase 0)* | id, config_key (unique), config_value (JSON text), updated_by_id, updated_at |
| **LoginAttempt** *(Phase 0)* | id, email, ip_address, success, attempted_at |
| **AdminAuditLog** *(Phase 0)* | id, admin_id, action, target_type, target_id (nullable), detail_json, performed_at |

> ⚠️ Integration tokens in `config_json` must be **encrypted at rest**. Never returned to the frontend. Critical for DSGVO compliance given German client data.

---

## 9. Proposed Tech Stack

> This is a proposal. Please confirm or override before design starts.

| Layer | Proposal | Notes |
|-------|----------|-------|
| Frontend | React 18 + Vite + Tailwind CSS v3, plain JS (no TypeScript), dark theme (`--accent: #6c63ff`) | Matches nmg-qa-tool house style |
| Drag & drop | `@dnd-kit/core` | Modern, accessible, works well with React |
| Backend | FastAPI (Python) + async SQLAlchemy | Matches existing NMG stack |
| Database | MySQL | Matches existing stack |
| Auth | JWT (access + refresh tokens), bcrypt passwords | Standard |
| Email | SMTP (configurable) or SendGrid for MVP | Needed for invites + notifications |
| File storage | Local disk (MVP) → S3 (Phase 2) | |
| Integrations | ClickUp REST API, GitHub REST API, GitLab REST API | |
| Charts | Recharts (React-native, lightweight) | Bar, donut, line charts for dashboard |
| Real-time | Polling (30s interval) for MVP → WebSocket (Phase 2) | In-app notification delivery |
| Deployment | Single server (frontend built, served via FastAPI or Nginx) | |

---

## 10. Non-Functional Requirements

- **Security:** encrypted integration tokens, hashed passwords, JWT auth (access + refresh tokens), role enforcement on every API endpoint, strict board-scoped data isolation (a client must never read another board's data). Password reset tokens are hashed and single-use.
- **DSGVO / GDPR:** minimal PII stored, data deletion (soft delete + anonymisation) supported, German timezone support, `og:locale=de_DE` where applicable.
- **Reliability:** card always saved locally before any integration push. Failed pushes are retryable. No data loss on integration errors. Session timeout handled gracefully with form content preserved in `sessionStorage`.
- **Performance:** board view paginated/virtualised for large card counts. Global search debounced (300ms), full-text indexed on card title + description. DB indexes on `board_id`, `list_id`, `card_id`, `user_id`.
- **Usability:** client-facing bug form — minimal required fields, mobile-responsive, no technical jargon. Empty states on every major view. First-board wizard for new users.
- **Accessibility:** keyboard navigation for Kanban, keyboard shortcuts with reference overlay, sufficient colour contrast on labels and priority badges, ARIA labels on icon-only buttons.

---

## 11. MVP Scope Summary

**In scope:**
- Auth (login, invite-based registration, JWT sessions with refresh tokens)
- Forgot password / email-based reset flow
- Session timeout warning with form content preservation
- Profile page (name, avatar, initials colour, change password, delete account)
- Admin panel (user management, member limits)
- My Boards home screen with real-time search
- First-board setup wizard (3-step onboarding)
- Empty states on all major views
- Client welcome email on first board join
- Boards with customisable Kanban columns (drag-and-drop lists + cards)
- Full bug card — Priority + Severity, auto-metadata, attachments, cover image, checklist/subtasks
- Due date picker with start date, due date + time, and recurring schedule (daily/weekly/monthly/yearly)
- List actions menu (copy list, move list, sort, watch, archive all)
- List automation rules (card-added trigger + daily/weekly sort rules + custom rule builder)
- Card count per column (live)
- Column WIP limit (soft, configurable per column)
- Board summary stats bar (open, severity breakdown, overdue, unassigned — clickable)
- Board-level activity feed (side panel)
- Dynamic labels per board
- Board & card filters (label, priority, severity, assignee, date, source, etc.)
- Bulk card actions (move, assign, priority, label, archive)
- Card copy / duplicate
- Assignees with email + in-app notifications
- @mentions in comments and descriptions
- Card activity history
- Full comment section — edit, delete, threaded replies, file attachments on comments
- In-app notification centre (bell icon, unread count, dropdown panel, full page)
- Per-user notification preferences (email / in-app / both / off per event type)
- @mention badge on card face (unread indicator)
- Global search (across all accessible cards, grouped by board, keyboard shortcut `/`)
- Keyboard shortcuts (`N`, `F`, `B`, `A`, `Esc`, `?`)
- Board sharing via email invite with platform user autopopulate
- Share board via link (view / comment / member access levels) with revoke option
- Join requests — users can request access via share link; Board Owner approves/declines
- Team members can invite (not just Board Owner)
- Per-member role management inline in the Share board modal
- Archive for cards and lists with 5-second undo + consolidated Archive section
- Export bugs to CSV (filtered or all)
- Per-board dashboard — 7 charts (severity, priority, column/status, label, assignee, trend, source) + 6 stat cards + filters + PDF/CSV export
- Global dashboard — 6 charts (bugs per board, global severity/priority, trend, top assignees, label usage) + 6 stat cards + PDF/CSV export
- One-way push to ClickUp + GitHub/GitLab (team decides per card)
- Email notifications for all key events
- Date/time auto-display throughout
- `source` field (internal vs client) on all cards

- **Card watchers** (Phase 15) — watch/unwatch any card, eye icon + count on card face, watchers notified of all card activity, watcher list in card detail
- **Card templates** (Phase 15) — per-board reusable templates (name, description, severity, priority, checklist items), template manager modal, "Use template" dropdown on column add, save-as-template from card
- **Command palette** (Phase 14) — `Cmd+K` / `Ctrl+K` fuzzy launcher: boards, cards, actions, recent items
- **SLA rules engine** (Phase 14) — per-board severity→hours rules, auto-due-date on card create, amber/red clock icon on card face, SLA breached chip in stats bar, SLA approaching/breached notifications
- **Email digests** (Phase 14) — daily/weekly opt-in digest emails: overdue assigned, newly assigned, boards snapshot, per-user frequency + send-hour preference, manual trigger endpoint

**Out of scope (Phase 2+):**
- Two-way sync with ClickUp/Git
- Slack notifications
- Browser extension / embeddable snippet
- SSO / SAML
- Native mobile apps
- Billing / subscription management
- WebSocket real-time updates (polling used for MVP — WebSockets implemented separately)

---

## 12. Open Decisions — Please Confirm

| # | Decision | Proposed default | Confirmed? |
|---|----------|-----------------|-----------|
| 1 | Sync direction MVP | One-way push only (tool → ClickUp/Git) | ⬜ |
| 2 | Kanban columns | Fully customisable per board | ✅ |
| 3 | Admin model | Admin manages users only; board owners manage boards | ✅ |
| 4 | Tech stack | React + FastAPI + MySQL | ⬜ |
| 5 | Email provider | SMTP config or SendGrid | ⬜ |
| 6 | File storage | Local disk for MVP | ⬜ |
| 7 | Project name | BugTrack (placeholder) | ⬜ |
| 8 | Screenshot capture | Upload-only for MVP | ⬜ |
| 9 | Timezone default | UTC+1 (German clients) | ⬜ |
| 10 | Public signup | Allowed from landing/pricing page | ✅ |
| 11 | 2FA method | Optional TOTP + email OTP fallback + 10 backup codes | ✅ |
| 12 | In-app payments | Not in MVP — pricing CTAs link to contact/sales email | ✅ |
| 13 | Pricing tiers | Free / Pro / Business / Enterprise | ⬜ (pricing TBD) |

---

*Last updated: Jun 13, 2026 — v1.1 · Phase 0 added: Landing, Pricing, Upgrade, Email OTP, 2FA, Plans, SystemConfig, AdminAuditLog, LoginAttempt lockout*
