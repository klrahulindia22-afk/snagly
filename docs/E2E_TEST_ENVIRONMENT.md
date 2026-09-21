# Snagly E2E test environment

Use a database that is separate from development and production. The recommended name is `snagly_e2e`.

## Seeded roles

All users share the value supplied as `E2E_PASSWORD`; it is never stored in source control.

| Role | Seeded email | Test purpose |
| --- | --- | --- |
| Super Admin | `admin@e2e.snagly.test` | Admin, plans, coupons and system settings |
| Board Owner | `owner@e2e.snagly.test` | Board, list, member and integration management |
| Team Member | `team@e2e.snagly.test` | Card, comment, checklist and assignment flows |
| Client | `client@e2e.snagly.test` | Restricted client access and client-submitted cards |
| Isolated Owner | `isolated-owner@e2e.snagly.test` | Permission and data-isolation checks |

The seed creates the plan/feature matrix, an isolated regression board, four lists, four cards across workflow states, labels, card assignments, a checklist and a client comment. It is idempotent.

## Run the seed

1. Apply database migrations to `snagly_e2e`.
2. Configure the E2E environment variables from `backend/.env.e2e.example` in the backend host.
3. Run:

```bash
E2E_SEED_CONFIRMATION=SEED_E2E_DATA E2E_PASSWORD='<unique-password>' python -m seeds.e2e
```

The script refuses to run when `APP_ENV=production`.

## Sandbox configuration

Create separate Stripe **test-mode** and Razorpay **test-mode** credentials in their own dashboards, then store them only in the E2E host's environment variables. Configure webhook listeners to the E2E API URL. Do not use live payment keys, real payment methods or production webhooks.

## CI secrets

Set these as GitHub Actions secrets in `snagly-playwright-automation`:

- `SNAGLY_BASE_URL`
- `SNAGLY_API_BASE_URL`
- `SNAGLY_TEST_USER_EMAIL` (`owner@e2e.snagly.test`)
- `SNAGLY_TEST_USER_PASSWORD` (the E2E seed password)
