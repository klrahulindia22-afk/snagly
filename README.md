# Snagly — Bug Tracker & Project Management Tool

A full-stack Kanban-style bug tracking platform built for both internal dev/QA teams and external clients. Bugs are managed on visual boards, synced to ClickUp and GitHub/GitLab, and gated behind a subscription system with Stripe and Razorpay payment support.

---

## Features

### Core App
- **Kanban boards** — drag-and-drop cards across customisable columns
- **Bug cards** — labels, assignees, due dates, attachments, checklists, custom fields, SLA rules
- **Role-based access** — Super Admin / Board Owner / Team Member / Client
- **Board sharing** — email invites, shareable links, join requests
- **Comments & mentions** — threaded comments with `@mention` notifications
- **Card activity log** — full audit trail of every change
- **Integrations** — one-way push to ClickUp and GitHub/GitLab per board
- **Import/Export** — CSV import, PDF/CSV export
- **Card templates** — reusable card blueprints per board
- **Command palette** — quick-search cards and boards (`Ctrl+K`)

### Dashboards
- **Global dashboard** — platform-wide stats: open bugs, severity breakdown, label heatmap, trend line
- **Per-board dashboard** — assignee workload, priority split, resolution time, source chart

### Notifications
- In-app notification centre with read/unread management
- Email notifications (SMTP)
- Browser push notifications
- Configurable digest preferences per user

### Auth & Security
- Email + password login with JWT (access 15 min / refresh 7 days)
- Email OTP verification on signup (6-digit, 10 min expiry, rate-limited resend)
- TOTP-based two-factor authentication (Google Authenticator / Authy)
- 10 backup recovery codes (hashed at rest)
- Integration tokens encrypted at rest (Fernet)
- Account lockout after failed login attempts

### Subscription & Billing
- Dual payment gateway: **Stripe** (global) + **Razorpay** (India/INR)
- Upgrade / downgrade / cancel / reactivate flows
- Webhook-driven plan changes — plan only updates after payment confirmed
- Coupon / promo code system with per-plan discounts
- Subscription admin panel with revenue stats and lifecycle management

### Admin Panel (separate app)
- User management — create, deactivate, reset password, 2FA enforcement
- Board limits — per-board member caps
- Invite management
- Revenue tab — subscription records, plan assignment, stat cards
- System settings — SMTP config, 2FA enforcement toggle, grace periods

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, Recharts, dnd-kit |
| Admin Panel | React 19, Vite, Tailwind CSS (separate app at port 5174) |
| Backend | FastAPI, Python 3.12+, SQLAlchemy 2 (async), Alembic |
| Database | MySQL 8 (via aiomysql) |
| Auth | JWT (python-jose), bcrypt (passlib), TOTP (pyotp) |
| Payments | Stripe, Razorpay |
| Email | SMTP via aiosmtplib |
| File storage | Local filesystem (configurable upload directory) |

---

## Project Structure

```
snagly/
├── backend/                  # FastAPI backend
│   ├── models/               # SQLAlchemy ORM models
│   ├── routers/              # API route handlers
│   ├── schemas/              # Pydantic request/response schemas
│   ├── services/             # Business logic (auth, email, subscriptions, payments)
│   ├── middleware/           # JWT auth middleware
│   ├── migrations/           # Alembic migration files
│   ├── seeds/                # Plan seed data
│   ├── tests/                # Unit + integration tests
│   ├── .env.example          # Environment variable template
│   └── main.py               # FastAPI app entry point
├── frontend/                 # Main React app (port 5173)
│   └── src/
│       ├── components/       # Board, auth, dashboard, profile, panels, UI
│       ├── api/              # Axios API clients
│       ├── stores/           # Zustand state (auth, subscription, theme)
│       ├── hooks/            # Custom hooks (notifications, plan limits)
│       └── styles/           # Global CSS + responsive breakpoints
├── frontend-admin/           # Admin panel React app (port 5174)
│   └── src/
│       ├── components/       # AdminShell, tab components
│       └── api/              # Admin API client
└── docs/                     # PRD and documentation
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- MySQL 8
- (Optional) Stripe account + Razorpay account for billing

### 1. Clone the repo

```bash
git clone https://github.com/klrahulindia22-afk/snagly.git
cd snagly
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Copy and fill in the environment file:

```bash
cp .env.example .env
# Edit .env with your DB credentials, SMTP settings, and payment keys
```

Run migrations:

```bash
alembic upgrade head
```

Seed plan data:

```bash
python -m seeds.plans
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev       # runs at http://localhost:5173
```

### 4. Admin panel setup

```bash
cd frontend-admin
npm install
npm run dev       # runs at http://localhost:5174
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `APP_SECRET_KEY` | Random secret for session signing |
| `DB_URL` | MySQL connection string |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Email delivery |
| `ENCRYPTION_KEY` | Fernet key for encrypting integration tokens |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe billing |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay billing |

Generate a Fernet key:

```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

---

## API

The backend runs at `http://localhost:8000`. Interactive docs available at:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Running Tests

```bash
cd backend
pip install -r requirements-test.txt
pytest tests/unit/
pytest tests/integration/   # requires a running test DB (see setup_test_db.py)
```

---

## User Roles

| Role | Description |
|------|-------------|
| **Super Admin** | Platform-wide: manage users, set board limits, access admin panel |
| **Board Owner** | Create/delete boards, invite members, configure integrations |
| **Team Member** | Add/edit/move cards, comment, push to integrations |
| **Client** | Submit bugs on their assigned board, comment on own cards |

---

## Payment Gateways

- **Stripe** — used for non-Indian users (USD, EUR, GBP). Configure `PAYMENT_GATEWAY_DEFAULT=stripe`.
- **Razorpay** — used for Indian users (INR). Configure `PAYMENT_GATEWAY_IN=razorpay`.

Webhook endpoints:
- Stripe: `POST /webhooks/stripe`
- Razorpay: `POST /webhooks/razorpay`

Register these URLs in your Stripe and Razorpay dashboards pointing to your deployed backend.

---

## License

Private — NMG Technologies. All rights reserved.
