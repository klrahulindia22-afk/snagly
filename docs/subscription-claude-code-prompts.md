# BugTrack — Subscription Module: Claude Code Prompts
# Build order: Admin Panel first → User-facing app second
# Paste each prompt into Claude Code in sequence. Never skip ahead.
# Each prompt has a DONE WHEN condition — verify it before moving to the next.

---

## PROMPT 1 — Data models and migrations

```
Read CLAUDE.md and docs/PRD.md §5.28 in full before writing any code.

We are building Phase 16 — Subscription & Billing. Start with Phase 16a: data models and migrations only. No endpoints, no services yet.

Do all of the following in order:

1. Expand the existing `Plan` model in backend/models/plan.py with these new columns:
   - sort_order SMALLINT DEFAULT 0
   - is_highlighted BOOL DEFAULT FALSE
   - stripe_price_id_monthly VARCHAR(255) nullable
   - stripe_price_id_yearly VARCHAR(255) nullable
   - razorpay_plan_id_monthly VARCHAR(255) nullable
   - razorpay_plan_id_yearly VARCHAR(255) nullable
   Generate and run the Alembic migration.

2. Create backend/models/subscription.py with the Subscription, PaymentMethod, and Invoice models.
   Fields are in PRD §5.28-G. Use async SQLAlchemy. All DATETIME fields in UTC.
   Add a UNIQUE index on Invoice.gateway_invoice_id.
   Generate and run the migration.

3. Create backend/models/coupon.py with Coupon and CouponRedemption models.
   Generate and run the migration.

4. Create backend/models/webhook_event.py with the WebhookEvent model.
   Add a UNIQUE index on (gateway, event_id).
   Generate and run the migration.

5. Update backend/models/user.py:
   - Replace plan_id FK → Plan with subscription_id FK → Subscription nullable
   - Add storage_used_bytes BIGINT DEFAULT 0 NOT NULL
   Generate and run the migration.

6. Create a seed function at backend/seeds/plans.py that creates the 4 default plans
   (Free, Pro, Business, Enterprise) with all 18 PlanFeatureFlag rows per plan using
   the default values from PRD §5.27 and §5.28. The function must be idempotent
   (safe to run twice without creating duplicates). Run it now:
   python -m backend.seeds.plans

7. Update plan_service.py:
   - Add get_user_plan(user) → reads user.subscription.plan_id, falls back to the
     Free plan row if subscription_id IS NULL
   - Add get_plan_limit(user, feature_key: str) → returns limit_value from
     PlanFeatureFlag for the user's current plan, or None if not found
   - Add is_feature_enabled(user, feature_key: str) → returns is_enabled bool

DONE WHEN: All migrations run cleanly. `alembic current` shows head. Seed runs and
creates 4 plans × 18 feature flags = 72 PlanFeatureFlag rows. No existing tests break.
```

---

## PROMPT 2 — Gateway services

```
Read CLAUDE.md §Phase 16b before writing any code.

We are on Phase 16b: Stripe and Razorpay gateway services. No API endpoints yet.

1. Add to backend/.env (and .env.example):
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_CURRENCY=USD
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   RAZORPAY_CURRENCY=INR
   PAYMENT_GATEWAY_IN=razorpay
   PAYMENT_GATEWAY_DEFAULT=stripe
   SUBSCRIPTION_GRACE_PERIOD_DAYS=7

2. Add to backend/requirements.txt:
   stripe>=7.0.0
   razorpay>=1.3.0
   Run pip install -r requirements.txt

3. Create backend/services/stripe_service.py with these async functions:
   - create_customer(user) → str (customer_id)
   - create_subscription(customer_id, stripe_price_id, trial_days=0) → dict
   - upgrade_subscription(gateway_subscription_id, new_stripe_price_id) → dict
   - cancel_subscription(gateway_subscription_id, at_period_end=True) → dict
   - reactivate_subscription(gateway_subscription_id) → dict
   - verify_webhook_signature(payload_bytes: bytes, sig_header: str) → dict (event)
   - get_invoice_pdf_url(gateway_invoice_id: str) → str | None
   All functions raise a StripeServiceError (custom exception) on failure.
   Never log the secret key. Read from config.py Settings object.

4. Create backend/services/razorpay_service.py with these async functions:
   - create_customer(user) → str (customer_id)
   - create_subscription(customer_id, razorpay_plan_id, trial_days=0) → dict
   - cancel_subscription(gateway_subscription_id) → dict
   - verify_webhook_signature(payload: bytes, signature: str) → dict (event)
   All functions raise a RazorpayServiceError on failure.

5. Create backend/services/subscription_service.py with:
   - get_gateway_for_user(user) → Literal['stripe', 'razorpay']
     (reads PAYMENT_GATEWAY_IN env var, checks user's billing country if stored,
     defaults to PAYMENT_GATEWAY_DEFAULT)
   - checkout(user, plan_id: int, billing_cycle: str) → dict
   - upgrade(user, new_plan_id: int) → Subscription
   - downgrade(user, new_plan_id: int) → Subscription
   - cancel(user, reason: str) → Subscription
   - reactivate(user) → Subscription
   - apply_coupon(user, code: str) → Coupon
   - apply_grace_period(subscription) → Subscription
   - downgrade_to_free(user) → None  [archives excess boards, sets subscription_id=NULL]

6. Write unit tests for:
   - plan_service.get_user_plan() — user with no subscription returns Free plan
   - plan_service.get_plan_limit() — returns correct value for each plan
   - subscription_service.get_gateway_for_user() — India user → razorpay, others → stripe
   Mock the Stripe and Razorpay SDK calls with unittest.mock.
   File: backend/tests/unit/test_subscription_service.py

DONE WHEN: pip install succeeds. Unit tests pass. No Stripe or Razorpay API calls
made during tests (all mocked). stripe_service and razorpay_service import cleanly.
```

---

## PROMPT 3 — Webhook handler

```
Read CLAUDE.md §Phase 16c and PRD §5.28-E before writing any code.

We are on Phase 16c: webhook handler. This is the most security-critical part
of the subscription module.

1. Create backend/routers/webhooks.py with two routes:
   POST /api/v1/webhooks/stripe
   POST /api/v1/webhooks/razorpay

   Both routes MUST:
   - Accept raw bytes body (use Request.body() — do NOT use FastAPI's automatic JSON parsing)
   - Verify signature BEFORE any DB operation
   - Check WebhookEvent.event_id for duplicates (return 200 immediately if already processed)
   - Insert WebhookEvent row with processed=False before calling the handler
   - Set processed=True and processed_at=now after successful handler
   - On any handler exception: set WebhookEvent.error=traceback_str, return HTTP 500
     (so the gateway retries)
   - NEVER return 4xx to a gateway webhook (gateways interpret 4xx as "don't retry")
     — on signature failure only, return 400

2. Create these handler functions in subscription_service.py:
   - on_subscription_activated(db, event_data) → updates Subscription.status=active,
     sends subscription_activated email via email_service
   - on_invoice_paid(db, event_data) → creates Invoice row status=paid,
     sends subscription_renewed email
   - on_payment_failed(db, event_data, attempt_number: int) →
     creates Invoice row status=failed;
     attempt 1 → send payment_failed_1 email;
     attempt 2 → send payment_failed_2 email;
     attempt 3 → send payment_failed_final email + call apply_grace_period()
   - on_subscription_cancelled(db, event_data) →
     schedules downgrade_to_free() after grace_period_ends_at
     (use FastAPI BackgroundTasks — do not block the webhook response)
   - on_trial_ending(db, event_data) → sends trial_ending_soon email

3. Add all 13 subscription email templates to email_service.py:
   trial_ending_soon, trial_expired, subscription_activated, subscription_renewed,
   payment_failed_1, payment_failed_2, payment_failed_final, plan_upgraded,
   plan_downgraded, subscription_cancelled, subscription_reactivated,
   grace_period_ending, downgraded_to_free
   Each template is a plain text + HTML tuple. Use {{ variable }} placeholders.

4. Register webhooks.py router in main.py

5. Write integration tests:
   - Stripe invoice.paid webhook → Invoice created, status=paid, email sent
   - Duplicate Stripe event_id → returns 200, no DB write, no email
   - Invalid Stripe signature → returns 400, no DB write
   - Razorpay subscription.activated → Subscription.status=active
   - Third payment failure → apply_grace_period() called
   Use httpx test client + mock Stripe/Razorpay SDK.
   File: backend/tests/integration/test_webhooks.py

DONE WHEN: All integration tests pass. Stripe test webhook can be replayed (using
stripe CLI: stripe trigger invoice.paid) and is processed exactly once. Duplicate
replay returns 200 immediately without double-processing.
```

---

## PROMPT 4 — Subscription and Admin API endpoints

```
Read CLAUDE.md §Phase 16d and §Phase 16e before writing any code.

We are on Phase 16d + 16e: subscription and admin API endpoints.

1. Create backend/routers/subscriptions.py with all endpoints from PRD §5.28-H:
   GET  /api/v1/plans                       (public, no auth, cache 60s)
   GET  /api/v1/subscriptions/me
   POST /api/v1/subscriptions/checkout
   POST /api/v1/subscriptions/upgrade
   POST /api/v1/subscriptions/downgrade
   POST /api/v1/subscriptions/cancel
   POST /api/v1/subscriptions/reactivate
   POST /api/v1/subscriptions/switch-cycle
   POST /api/v1/subscriptions/apply-coupon
   GET  /api/v1/invoices
   GET  /api/v1/invoices/:id/pdf
   GET  /api/v1/payment-methods/me
   DELETE /api/v1/payment-methods/:id

   GET /subscriptions/me must return:
   { subscription, plan, usage: { boards_used, boards_limit,
     members_max_any_board, members_limit, storage_used_bytes, storage_limit_bytes,
     storage_used_pct } }

   NEVER return gateway secret keys, webhook secrets, or full card numbers.
   PaymentMethod response: card_brand, card_last4, card_exp_month, card_exp_year only.

2. Expand backend/routers/admin.py with the subscription admin endpoints:
   GET    /api/v1/admin/subscriptions
   PATCH  /api/v1/admin/subscriptions/:id    (manual plan override, audit logged)
   GET    /api/v1/admin/revenue
   GET    /api/v1/admin/coupons
   POST   /api/v1/admin/coupons
   PATCH  /api/v1/admin/coupons/:id

   Also add plan management endpoints (used by the admin plan builder UI):
   GET    /api/v1/admin/plans                (all plans including drafts)
   POST   /api/v1/admin/plans               (create new plan)
   PATCH  /api/v1/admin/plans/:id           (edit plan — audit logged)
   DELETE /api/v1/admin/plans/:id           (only if subscribers=0)
   POST   /api/v1/admin/plans/:id/publish   (set is_active=True)
   POST   /api/v1/admin/plans/:id/unpublish (set is_active=False)

   For gateway config:
   GET    /api/v1/admin/gateway-config       (returns masked keys — last 4 chars only)
   PATCH  /api/v1/admin/gateway-config       (stores encrypted in SystemConfig, audit logged)

3. Write Pydantic schemas for every request/response in backend/schemas/subscription.py
   and backend/schemas/coupon.py

4. Register both routers in main.py

5. Write integration tests:
   File: backend/tests/integration/test_subscription_api.py
   - GET /plans returns all active plans with feature flags
   - GET /subscriptions/me with no subscription returns Free plan + correct limits
   - POST /subscriptions/cancel sets cancel_at_period_end=True on gateway subscription
   - POST /subscriptions/apply-coupon with invalid code → 404
   - POST /subscriptions/apply-coupon with depleted code → 409
   - POST /subscriptions/upgrade as client role → 403
   - GET /admin/subscriptions as non-admin → 403
   - PATCH /admin/subscriptions/:id writes to AdminAuditLog

DONE WHEN: All integration tests pass. GET /api/v1/plans returns JSON with 4 plans
and all feature flags. Swagger UI at /docs shows all new endpoints. No secret keys
in any response body.
```

---

## PROMPT 5 — Admin panel UI (frontend)

```
Read CLAUDE.md §Phase 16f before writing any code.
Read docs/PRD.md §5.28-A for the admin UI specification.

We are on Phase 16f: Admin panel subscription UI. Build this before the user-facing
checkout. Admin must be able to configure plans and gateways first.

1. Create frontend/src/components/admin/AdminSubscriptionsPane.jsx

   It has 4 tabs: Plans, Payment gateways, Subscribers, Coupons.
   Use the same tab pattern as existing AdminShell tabs.
   Add a revenue stats bar above the tabs:
   MRR / ARR / Active subscribers / Trialing / Churn rate
   — pulled from GET /api/v1/admin/revenue

2. Plans tab:
   - Plan overview grid: 4 cards (one per plan). Card shows name, price, subscriber
     count, status pill (Published=green / Draft=gray). Clicking a card opens the
     editor below the grid.
   - "New plan" button top-right → opens editor with blank fields
   - Plan editor sections (all in one scrollable area below the grid):
     a) Basic info: plan name input, display name input, description textarea
     b) Pricing: monthly price (number), yearly price (number), trial days (number),
        default billing cycle pill selector (Monthly / Yearly / Both)
     c) Limits: max boards (number, 0=unlimited), members per board (number, 0=unlimited),
        storage GB (number, 0=unlimited)
     d) Feature flags: grid of toggle rows, one per feature_key.
        Keys with type=limit show an inline number input next to the toggle.
        Keys with type=bool show only the toggle.
        All 18 feature_key values from PRD §5.28-G feature flags table.
     e) Actions row: [Delete] [Save as draft] [Publish]
        Delete → only enabled if subscriber count = 0
        Save draft → PATCH /admin/plans/:id
        Publish → POST /admin/plans/:id/publish
   - On save: show success toast "Plan saved"

3. Payment gateways tab:
   - Stripe section: publishable key, secret key (masked), webhook secret (masked),
     currency select. Show/hide toggle per masked field.
   - Razorpay section: key ID, key secret (masked), webhook secret (masked), currency.
   - Gateway routing rules: list of country → gateway mappings. Add/remove rows.
   - Test mode indicator: if keys start with pk_test/sk_test/rzp_test, show amber
     "Test mode" badge. If live keys, show green "Live mode" badge.
   - Save button → PATCH /admin/gateway-config

4. Subscribers tab:
   - Data table: email, plan badge, gateway pill, status pill, period end, cancel_at_period_end flag
   - Search input (filter by email)
   - Filter dropdowns: Plan, Gateway, Status
   - "Override plan" button per row → opens modal with plan selector
     → PATCH /admin/subscriptions/:id { plan_id }
     → Show warning: "This bypasses payment gateway. Use for Enterprise accounts only."

5. Coupons tab:
   - Coupon list table: code, discount, applies to, uses/max, status pill, expires, Deactivate button
   - Create form above the table:
     code (uppercase-enforced input), discount type (% / fixed), value,
     applies to (all plans / specific plan select), duration (forever/once/months),
     duration months (shown when duration=months), max redemptions (0=unlimited),
     expiry date (optional datepicker)
   - Create button → POST /admin/coupons

6. Add "Subscriptions" to the admin sidebar nav (AdminShell.jsx), between
   "Board limits" and "Invites"

7. API layer: create frontend/src/api/admin.js functions:
   getAdminPlans(), createPlan(), updatePlan(), publishPlan(), unpublishPlan()
   getAdminRevenue(), getAdminSubscriptions(), overrideSubscription()
   getAdminGatewayConfig(), updateGatewayConfig()
   getAdminCoupons(), createCoupon(), updateCoupon()

DONE WHEN: Admin can navigate to Subscriptions in the sidebar. Can edit a plan's
feature flags, save it, and publish it. Can enter (masked) gateway keys and save.
Can see subscriber list and override a plan. Can create a coupon. All actions show
success/error feedback.
```

---

## PROMPT 6 — User-facing subscription management UI (frontend)

```
Read CLAUDE.md §Phase 16g before writing any code.
Read docs/PRD.md §5.28-C for the user subscription management spec.

We are on Phase 16g: user-facing subscription UI.
Prerequisite: Prompts 1–5 must be complete and admin can manage plans end-to-end.

1. Add "Subscription" to the profile sidebar nav in ProfileShell.jsx
   (between "My boards" and "Notifications")
   Route: /profile?tab=subscription

2. Create frontend/src/components/profile/ProfileSubscriptionPane.jsx with 4 tabs:

   A. Current plan tab:
      - Plan hero row: plan icon (rocket/star/building based on plan name),
        plan display_name, billing cycle pill (Monthly/Yearly/Trial), price,
        payment method summary ("Visa ••••4242"), next renewal date
      - Usage bars section (3 bars):
        • Boards: used / limit. Green → amber at 80% → red at 95%
        • Members (largest board): used / limit
        • Storage: used_bytes formatted (MB/GB) / limit formatted. Same colour logic.
      - Feature list: 2-column grid. Included features: ✓ green icon + label.
        Excluded features: ✗ muted, strikethrough, + "[plan name]" amber pill.
        Only show top 8 features — "Show all" toggle.
      - Trial countdown banner (shown when trial_end is set):
        • >3 days: amber banner "Trial ends in X days. [Add payment method →]"
        • ≤3 days: red banner "Trial ends in X days — add payment now to avoid interruption"
      - Payment failure banner (shown when status=past_due):
        red banner "Your payment failed. Update your card to avoid losing access. [Update card →]"
      - Grace period banner (shown when grace_period_ends_at is set):
        red banner "Grace period ends [date]. Update payment or your account moves to Free."
      - cancel_at_period_end banner:
        amber banner "Subscription cancelled. Access until [date]. [Reactivate →]"

   B. Change plan tab:
      - Plan cards: Free, Pro, Business (3 columns)
        Current plan: blue border + "Current plan" badge (no CTA button, greyed)
        One tier up: green border + "Recommended" badge + upgrade CTA (blue button)
        Lower plans: default border + downgrade CTA (grey button, text: "Downgrade to X")
        Enterprise: separate CTA row below the 3 cards: "Need Enterprise? Contact sales →"
      - Upgrade confirm modal:
        Title: "Upgrade to [plan]"
        Body: "You'll be charged [amount] today, prorated for [N] remaining days.
               Your card [brand ••••last4] will be charged."
        Buttons: "Cancel" + "Confirm upgrade" (calls POST /subscriptions/upgrade)
      - Downgrade confirm modal:
        Title: "Downgrade to [plan]"
        Body: List what will be lost (map feature differences to readable sentences).
              "Changes take effect on [period_end_date]. Until then you keep full access."
        Buttons: "Keep [current plan]" + "Confirm downgrade" (calls POST /subscriptions/downgrade)
      - Plan comparison table below cards (collapsible, collapsed by default):
        Rows = all 18 feature keys. Columns = Free / Pro / Business. ✓/✗ or limit value.

   C. Billing history tab:
      - Invoice table: date, description ("Pro — Monthly"), amount + currency,
        status pill (Paid=green / Failed=red / Retried=amber),
        download icon button (→ GET /invoices/:id/pdf redirects to PDF)
        Retry button shown only for failed invoices.
      - Pagination: 10 per page
      - Payment method card below table:
        Card brand icon + "•••• •••• •••• [last4]" + "Exp [month]/[year]"
        "Update card" button → calls gateway billing portal (Stripe: stripe.js redirectToCustomerPortal,
        Razorpay: redirect to Razorpay hosted page). Store portal URL from GET /payment-methods/me

   D. Manage tab:
      - Billing cycle switch section:
        "You're on monthly billing. Switch to yearly and save [amount]/year."
        "Switch to yearly" button → POST /subscriptions/switch-cycle { billing_cycle: 'yearly' }
        Show reverse if on yearly.
      - Cancel subscription section:
        "If you cancel, you'll keep access until [period_end_date]."
        Reason dropdown: Too expensive / Missing features / Switching tools / Project ended / Other
        "Keep [plan name]" (outline) + "Cancel subscription" (red) buttons
        → POST /subscriptions/cancel { reason }
        If cancel_at_period_end=true: show "Reactivate subscription" button instead
        → POST /subscriptions/reactivate
      - Coupon code section:
        Text input + "Apply" button → POST /subscriptions/apply-coupon { code }
        Show success: "Discount applied! [X]% off for [duration]"
        Show error: "Invalid or expired code"

3. Create frontend/src/pages/UpgradeScreen.jsx at route /upgrade
   - Shown when any plan-gated action fails (redirect from toast CTA or hard block modal)
   - URL param: ?reason=board_limit|member_limit|integration|export|storage (optional)
   - Shows which limit was hit (if reason param present) with current usage
   - Plan comparison cards (same as Change plan tab)
   - Pre-highlights the lowest plan that resolves the specific limit

4. Create frontend/src/hooks/usePlanLimits.js
   - Reads plan limits from Zustand store (populated by GET /subscriptions/me on login)
   - Exports: planLimits, canCreateBoard(), canInviteMember(boardId), isFeatureEnabled(key),
     getRemainingStorage(), getStoragePct()
   - Used by every component that has a plan-gated action

5. Wire plan-limit enforcement across the app:
   - MyBoards.jsx: disable "Create board" when !canCreateBoard(), show upgrade toast
   - ShareBoardModal.jsx: disable "Send invite" when member limit reached
   - CardModal.jsx: pass planLimits to AttachPanel for file size + attachment count checks
   - Board nav bar: show "Upgrade" button when user is on Free plan

6. Create frontend/src/api/subscription.js with all API calls:
   getMySubscription(), getPlans(), checkout(), upgrade(), downgrade(),
   cancel(), reactivate(), switchCycle(), applyCoupon(),
   getInvoices(), getInvoicePdfUrl(), getMyPaymentMethod()

DONE WHEN: User can see their current plan, usage bars, and feature list. User can
upgrade (Stripe test checkout completes, webhook activates subscription, page refreshes
with new plan). User can cancel (cancel_at_period_end banner appears). Plan limits
block the correct actions with correct toast messages. /upgrade screen shows the right
plan pre-highlighted.
```

---

## PROMPT 7 — Public pricing page

```
Read docs/PRD.md §5.21 pricing page spec before writing any code.

We are on the final part: the public pricing page.
Prerequisite: GET /api/v1/plans endpoint is working (Prompt 4).

1. Update frontend/src/pages/PricingPage.jsx (already exists from Phase 0)
   Replace any static/hardcoded plan data with a live fetch from GET /api/v1/plans

2. Pricing page layout (driven entirely from DB — no hardcoded plan names or prices):
   - Billing cycle toggle at top: "Monthly" / "Yearly" (pill selector)
     Yearly shows the yearly price with a savings badge (e.g. "Save 17%")
   - Plan cards (one per active plan, ordered by sort_order):
     • Plan name (display_name)
     • Price for selected billing cycle
     • Trial badge if trial_days > 0: "14-day free trial"
     • is_highlighted=true → green border + "Most popular" badge
     • Feature list: one row per PlanFeatureFlag, is_enabled=true → ✓ , false → ✗
       Limit features show the value: "Up to 10 boards", "Up to 25 members/board"
     • Primary CTA button:
       If user logged in and this is their current plan → "Current plan" (disabled, green)
       If user logged in and this is higher → "Upgrade to [name]" (links to /profile?tab=subscription&section=change)
       If user not logged in → "Get started" (links to /signup?plan=[id])
       Enterprise plan → "Contact sales" (mailto link)
   - Feature comparison table below cards (collapsible, collapsed by default)
   - FAQ section below table (static, 4–5 common questions)

3. If user arrives at /signup?plan=[id], store plan_id in sessionStorage
   After email verification, auto-redirect to checkout for that plan

DONE WHEN: Pricing page loads plan data from API. Toggling Monthly/Yearly updates
all prices. CTA buttons link to correct destinations for logged-in and
logged-out users. A logged-in Free user sees correct "Upgrade to Pro" CTAs.
Adding a new plan in admin and publishing it appears on the pricing page
without any frontend code change.
```

---

## Notes for Claude Code

- Always read CLAUDE.md at the start of each session
- Always run `alembic upgrade head` after each migration
- Always run the relevant test file after each prompt with `pytest -v`
- If a test fails, fix the code (not the test) unless the test itself has a bug
- Never hardcode Stripe price IDs or Razorpay plan IDs — always read from the Plan model
- All monetary amounts in the DB are stored in the smallest currency unit (paise for INR,
  cents for USD) if using Stripe conventions — but since PRD stores DECIMAL(10,2), store
  as the full decimal amount (e.g. 499.00) and only convert to smallest unit when calling
  the gateway API
- Webhook endpoints must use `Request.body()` not FastAPI body injection
  (Stripe signature verification requires the raw bytes)
- Test mode: use Stripe test cards (4242 4242 4242 4242) and Razorpay test credentials
- Install Stripe CLI for local webhook testing:
  `stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe`
