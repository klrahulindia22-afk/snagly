# Snagly test-environment deployment

This project can be deployed as a single Vercel Services project:

- the React application is served at `/`;
- the FastAPI service is mounted at `/api`;
- the browser calls the API at `/api/api/v1/...`. Vercel removes the first `/api` before forwarding the request to FastAPI, whose routes begin with `/api/v1`.

## Vercel setup

1. Import `klrahulindia22-afk/snagly` and select the `develop` branch.
2. Set the project framework preset to **Services**.
3. Add the environment variables below to **Preview** and **Production**. Do not commit them or place them in `.env.example` with real values.
4. Deploy once, then set `FRONTEND_URL` and `ADMIN_URL` to the deployed HTTPS URL and redeploy.
5. Run Alembic migrations against the TiDB database before acceptance testing.

## Required environment variables

| Variable | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `APP_SECRET_KEY` | A newly generated long random secret |
| `ENCRYPTION_KEY` | A newly generated Fernet key |
| `DB_URL` | TiDB Cloud async SQLAlchemy connection string |
| `FRONTEND_URL` | Deployed Vercel HTTPS URL |
| `ADMIN_URL` | Deployed URL (or the URL plus `/admin`) |
| `VITE_API_URL` | `/api` |

Use a TiDB Cloud connection string compatible with the `aiomysql` driver. Keep the TiDB password and TLS details only in Vercel environment variables.

## Test-environment limitations

- The Vercel filesystem is ephemeral. Attachments are suitable only for short-lived test runs until object storage is configured.
- Use sandbox-only Stripe/Razorpay keys, or leave payment keys blank while validating non-payment flows.
- SMTP can remain unconfigured; development email messages are logged by the application.
- The FastAPI WebSocket endpoint is routed through the same `/api` service. Confirm it manually after deployment because it is used for live notifications.

## Verification

After deploying, check:

```text
GET https://<deployment>/api/api/v1/health
```

Then set the GitHub Actions secret `SNAGLY_BASE_URL` in the automation repository to `https://<deployment>` and run the Playwright workflow.
