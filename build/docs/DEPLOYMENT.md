# Deploying a synthetic CareLoop demonstration

Checked against provider documentation in November 2026. Plans and limits change; recheck the linked pages before creating services. No hosting account, API key, public deployment, or third-party notification has been created for you.

The complete no-subscription demonstration is local Docker Compose. A hosted demo can use Vercel + Render + Neon/Supabase, but free sleeping services cannot guarantee timely reminders or uninterrupted report processing. This build remains synthetic-only on every host.

## Recommended order

1. Create a private Git repository from the source. Commit `.env.example`, never `.env`, private credentials, or generated build folders.
2. Create a dedicated PostgreSQL database on Neon or Supabase and enable `vector`.
3. Generate independent secrets locally with `npm run setup:env`; copy required values into each host's secret settings.
4. Deploy the AI Docker service, initially in offline mode.
5. Deploy the API Docker service; run migrations and synthetic seed once.
6. Deploy the Next.js frontend, then set the API's exact frontend origin and HTTPS cookie setting.
7. Configure an always-on n8n instance, import and test the four workflows, then publish them.
8. Run health, sign-in, upload, clinic-review, and reminder checks against the hosted synthetic demo.

## PostgreSQL: Neon or Supabase

Use a separate project/database containing no real records. Copy its connection URL into the API's `DATABASE_URL` secret. URL-encode special characters in passwords if assembling the URL manually. Use TLS with certificate verification; do not disable certificate checks to make deployment work.

Run `CREATE EXTENSION IF NOT EXISTS vector;` if it is not already enabled; the migration also requests it. Use a role permitted to create the extension/schema for migrations. For routine request traffic use a bounded application role/pool; the API's pool maximum is eight.

Neon supports [pgvector](https://neon.com/docs/extensions/pgvector) and [pooled connections](https://neon.com/docs/connect/connection-pooling). Its [free plan](https://neon.com/pricing) currently includes 100 CU-hours and 1 GB storage per project, with scale-to-zero. Report files are encrypted in PostgreSQL in this demo, so large uploads consume database storage quickly.

Supabase provides [pgvector](https://supabase.com/docs/guides/database/extensions/pgvector). Its direct endpoint is normally IPv6; for an IPv4-only host use the **Session pooler on port 5432**. Use the provider's [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) to choose the appropriate URI. Free projects may [pause after a week of inactivity](https://supabase.com/docs/guides/platform/free-project-pausing).

## AI: Render Docker service

- Repository root build context; Dockerfile `ai/Dockerfile`.
- Set `PORT=8000` (or use the host's assigned port; the Docker entrypoint reads `PORT`), health path `/health`.
- Set `SYNTHETIC_DATA_ONLY=true`, `AI_MODE=offline`, and `AI_SERVICE_TOKEN` matching the API.
- For live mode, set provider/model/key variables from [configuration](CONFIGURATION.md). Only AI receives provider keys.
- Keep Langfuse disabled initially. If enabled, use the metadata-only implementation already supplied.

The Docker image includes PDF extraction and Tesseract English/Urdu. Authentication protects processing endpoints even if the service has a public HTTPS hostname. Configure API `AI_BASE_URL` to the service URL (without a trailing slash). Restrict network access between services where your hosting plan supports it.

## API: Render Docker service

- Dockerfile `api/Dockerfile`, repository root build context.
- `NODE_ENV=production`, `PORT=4000` or Render's assigned port; the API binds `0.0.0.0` and reads `PORT`.
- Health path `/ready` checks database connectivity. `/health` checks only the process.
- Set `DATABASE_URL`, `FIELD_ENCRYPTION_KEY`, `EMAIL_LOOKUP_KEY`, `JWT_ACCESS_SECRET`, `AI_SERVICE_TOKEN`, `AUTOMATION_TOKEN`, `AUTOMATION_WEBHOOK_SECRET`, `AI_BASE_URL`, `SYNTHETIC_DATA_ONLY=true`.
- Set `CORS_ORIGIN=https://your-frontend.example` and `COOKIE_SECURE=true`.
- Set `SEED_PASSWORD` only for the fictional demo seed; retain it privately.

Leave Render's **Docker Command empty**. The image's default `sh api/start.sh` applies migrations and seeds, then starts the server only after successful setup. Clear any previously entered `sh -c ...` command override before redeploying the updated image. Migrations and seeds are idempotent; do not run competing migration commands across multiple replicas. Native migration alternative: build the API locally, set its environment to the hosted synthetic database, and run `npm run db:seed --workspace @careloop/api`.

The worker runs inside the API process. Sleeping/stopped API services delay jobs. Stale claims become eligible for recovery after ten minutes. Production high-volume queues, malware scanning, managed secret rotation, object storage, and comprehensive clinical review are future infrastructure work.

Render's [free service restrictions](https://render.com/docs/free) include sleeping after 15 idle minutes, 750 free instance-hours shared across a workspace monthly, no persistent disk, and blocked outbound SMTP ports. Two continuously running services exceed that monthly allowance. Use [Docker deployment documentation](https://render.com/docs/docker) for platform settings. Do not promise a continuously available clinic system on these free plans.

## Frontend: Vercel

- Import the monorepo; Root Directory **frontend**, Framework **Next.js**.
- Select **Node 24** explicitly in project settings. Keep the root lockfile and allow access to files outside the root directory for the shared TypeScript config/workspace dependencies.
- Use Vercel's monorepo dependency install detection; if overriding, run `npm ci` from the repository root. Build runs `npm run build` inside `frontend`.
- Add server-only `API_INTERNAL_URL=https://your-api.onrender.com` and `NEXT_TELEMETRY_DISABLED=1`.
- No secrets need a `NEXT_PUBLIC_` prefix. The frontend route handler proxies requests and refresh cookies to the API.
- Redeploy after changing server environment values, then update API `CORS_ORIGIN` to the stable production frontend origin. Preview deployments need their own explicit origin/configuration.

Vercel's [Hobby plan](https://vercel.com/docs/plans/hobby) is for personal/non-commercial use. Check eligibility before using it for a clinic product. See [monorepos](https://vercel.com/docs/monorepos) and [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

**Upload limitation:** Vercel Functions have a [4.5 MB request/response payload limit](https://vercel.com/docs/functions/limitations). The app supports 10 MB locally, but the same-origin Vercel proxy cannot accept files over the platform limit. Use small synthetic fixtures on Vercel. For larger reports, host the Next.js Docker service on a platform supporting larger bodies, or implement an authenticated object-storage upload design before increasing the limit. Do not expose service tokens in browser upload code.

## AI alternative: Hugging Face Docker Space

Use a private synthetic demonstration if your account supports Docker Spaces. Add Space metadata `sdk: docker` and `app_port: 7860`, adapt the AI image to run as UID 1000 and set `PORT=7860`, then store `AI_SERVICE_TOKEN` and provider keys in Space **Secrets**. Only upload the AI build context; do not include local `.env` files. The current root-context Dockerfile must be adapted if copying only `ai/` into a standalone Space repository.

[Spaces documentation](https://huggingface.co/docs/hub/spaces-overview) currently describes CPU Basic as hourly-free but requires a paid plan to create compute Spaces. Verify account eligibility rather than assuming a universally free Docker host. See [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker) for port/user/storage requirements. Sleeping Spaces delay report extraction; filesystem persistence is unnecessary because reports live encrypted in PostgreSQL.

## Hosted n8n

Use an always-on host with a durable volume or database. Preserve `N8N_ENCRYPTION_KEY` across upgrades. Set `N8N_HOST`, `N8N_PROTOCOL=https`, `N8N_EDITOR_BASE_URL`, `N8N_WEBHOOK_URL`, `N8N_SECURE_COOKIE=true`, timezone, and the exact number of trusted proxy hops for your topology. Do not reuse the local insecure-cookie setting on public hosting. Keep execution-data persistence disabled as in Compose.

In each imported workflow, replace `http://api:4000/api/automation/tick` with the API's reachable HTTPS endpoint and attach the Header Auth credential. Configure the inbound clinic webhook credential, test manually, and publish. n8n account-email SMTP variables do not configure workflow delivery credentials. This version delivers to the CareLoop inbox only.

See [n8n reverse-proxy webhook configuration](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/) and [encryption keys](https://docs.n8n.io/hosting/configuration/configuration-examples/encryption-key/). A sleeping free web host is not suitable for reliable reminder scheduling.

## Before sharing a hosted demo

- Verify HTTPS, exact origins, secure refresh cookies, private service tokens, and ignored secrets.
- Confirm that a second patient cannot access the first patient's report and a patient cannot open clinic endpoints.
- Upload the supplied synthetic PDF and PNG, verify values against the file, check Urdu/RTL and guarded chat, then inspect the clinic queue.
- Test a due reminder and a weekly summary in n8n; confirm only counts enter workflow execution data.
- Keep the synthetic-only banner and unverified-range labels visible. Never describe this build as medically validated or compliance-certified.
- Confirm backup/restore of database **and encryption keys**, monitor storage, and make plan limits visible to anyone testing the demo.
