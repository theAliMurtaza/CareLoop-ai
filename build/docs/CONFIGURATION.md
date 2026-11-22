# CareLoop configuration, keys, and n8n

Start with offline mode. No LLM subscription, Google login, SMTP, or paid key is needed to try the full synthetic report flow.

## Local setup

Run from the repository root (on this computer, `D:\CareLoop\build`):

```powershell
npm run setup:env
docker compose up -d --build
docker compose ps
```

The setup command creates ignored `.env` files and independent random secrets. It writes the fictional account password to `../work/LOCAL-DEMO-ACCOUNTS.txt`; open that file locally. Do not upload it or paste it into chat. Accounts: `sarah@example.test`, `ali@example.test`, `clinic@example.test`, `admin@example.test`. Registration creates patient accounts only, using fictional `@example.test` or `@careloop.test` addresses.

Use **http://localhost:3000** consistently. The production Compose API allowlist uses that origin. n8n is **http://localhost:5678**. Database port is **55432**. Ports bind to loopback. Compose seeds only synthetic records, with unverified engineering ranges.

Do not regenerate encryption keys after storing data. Keep an encrypted backup of `.env` separately from your database backup. Changing `FIELD_ENCRYPTION_KEY` without a migration makes existing records unreadable. Changing `EMAIL_LOOKUP_KEY` breaks email lookup. Changing `N8N_ENCRYPTION_KEY` makes stored n8n credentials unreadable. Seed passwords are applied only when a user is first created.

## Where each variable goes

| Variable | Services | Purpose |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | Root Compose | Local database connection; generated password uses URL-safe hex. |
| `DATABASE_URL` | API only | Full PostgreSQL URI. Compose constructs it; host development uses `api/.env`. |
| `FIELD_ENCRYPTION_KEY` | API only | 32-byte AES-256-GCM key encoded as 64 lowercase hex characters. |
| `EMAIL_LOOKUP_KEY` | API only | Separate 64-hex HMAC key for email lookup. |
| `JWT_ACCESS_SECRET` | API only | Separate 64-hex JWT signing secret. Access tokens last 10 minutes; refresh cookies rotate. |
| `AI_SERVICE_TOKEN` | API and AI | Identical 64-hex service credential, never a browser variable. |
| `AUTOMATION_TOKEN` | API and n8n credential | 64-hex bearer credential for notification jobs. |
| `AUTOMATION_WEBHOOK_SECRET` | API and n8n webhook credential | Separate 64-hex webhook secret. API signed-webhook callers use HMAC; n8n inbound webhook uses header authentication. |
| `N8N_ENCRYPTION_KEY` | n8n only | Encrypts n8n's stored credentials. |
| `AI_BASE_URL` | API | `http://ai:8000` in Compose; hosted AI HTTPS URL when deployed. |
| `API_INTERNAL_URL` | Frontend server | `http://api:4000` in Compose; API HTTPS URL when deployed. Do not add `NEXT_PUBLIC_`. |
| `CORS_ORIGIN` | API | Exact frontend origin, no trailing slash. |
| `COOKIE_SECURE` | API | `false` for local HTTP, `true` for hosted HTTPS. |
| `AI_MODE` | AI | `offline` for grounded templates/parser, `live` for configured model selection and extraction fallback. |
| `LLM_PROVIDER`, `LLM_MODEL` | AI | `gemini`, `groq`, or `ollama`, with a currently available model ID. |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | AI only | Set only the selected provider's key. |
| `OLLAMA_BASE_URL` | AI | Docker-to-host: `http://host.docker.internal:11434`; native: `http://localhost:11434`. |
| `LANGFUSE_ENABLED`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | AI only | Optional metadata-only traces; disabled by default. |
| `SEED_PASSWORD` | API setup only | Generated fictional-account password; not a production credential policy. |
| `SYNTHETIC_DATA_ONLY` | API and AI | Must remain `true`; this build rejects real-data mode. |
| `DEFAULT_CLINIC_ID` | API | Seed clinic UUID; see `api/.env.example`. |
| `TIMEZONE` / `GENERIC_TIMEZONE` | Compose / n8n | Default `Asia/Karachi`. Database due times are UTC; forms display device local time. |

For Docker, edit the root `.env`, then `docker compose up -d` to recreate affected containers. For native development, edit the relevant service `.env` and restart that service. The setup script preserves existing service overrides; root provider edits are not automatically copied over existing AI settings.

## Choose an LLM provider

The application works without a model in `offline` mode. Live mode uses the provider to select grounded sentences and attempts extraction on unsupported text; independently verified source matches remain mandatory. It does not permit unconstrained medical advice.

**Gemini:** create a dedicated key in [Google AI Studio](https://aistudio.google.com/apikey), choose an available text model from the [model documentation](https://ai.google.dev/gemini-api/docs/models), and set `AI_MODE=live`, `LLM_PROVIDER=gemini`, `LLM_MODEL=<model-id>`, `GEMINI_API_KEY=<your-key>` in the AI environment. Check your account's [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [pricing/data-use terms](https://ai.google.dev/gemini-api/docs/pricing). Free-tier content may be used to improve products; use only the supplied synthetic fixtures.

**Groq:** create a project key in [Groq Console](https://console.groq.com/keys), select an available [model](https://console.groq.com/docs/models), then set `AI_MODE=live`, `LLM_PROVIDER=groq`, `LLM_MODEL=<model-id>`, `GROQ_API_KEY=<your-key>`. Free limits depend on the account and model; see [rate limits](https://console.groq.com/docs/rate-limits).

**Ollama:** install [Ollama](https://docs.ollama.com/quickstart), run `ollama pull llama3.2:3b`, and start its local server. Set `AI_MODE=live`, `LLM_PROVIDER=ollama`, `LLM_MODEL=llama3.2:3b`. No cloud key is needed. Keep its unauthenticated port private. The model must fit your available RAM.

Provider requests have timeouts and bounded attempts. If explanations cannot be verified, the API returns a safe fallback while preserving deterministic flags. If extraction cannot complete, the report shows a failure/retry state. Live provider quality and quotas must be evaluated with your chosen model; no provider credentials are bundled.

## Configure n8n

On the original `D:\CareLoop\build` installation, the two credentials and all four workflows have already been imported and published. Create your own n8n owner account at the URL below and check the imported workflows; do not import duplicate copies. The following full setup is for a fresh installation or another computer. Exported workflow files deliberately remain inactive and contain no secrets.

1. Open **http://localhost:5678** and create your local n8n owner account yourself. It is separate from CareLoop's fictional accounts.
2. Import all four JSON files from `automation/workflows` using n8n's workflow import menu.
3. Create a **Header Auth** credential named **CareLoop API automation**. Header name: `Authorization`. Value: `Bearer ` followed by the root `.env` value of `AUTOMATION_TOKEN`.
4. Select that credential in each **Create private inbox notifications** HTTP Request node. The local URL is `http://api:4000/api/automation/tick`.
5. For the escalation workflow, create **CareLoop clinic webhook**, also Header Auth. Header name: `X-CareLoop-Webhook`; value: root `AUTOMATION_WEBHOOK_SECRET`. Select it in **Secured clinic webhook**.
6. Use **Manual test** to run each workflow. Only `{created: number}` returns to n8n. Open the CareLoop inbox and clinic queue to inspect results.
7. Save and **publish** each workflow. Schedule triggers do not run merely because the file was imported. Set the workflow timezone as desired. See [n8n schedules](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/) and [webhook authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/).

Medication reminders run every minute; follow-ups every 15 minutes; escalation checks every minute plus the authenticated webhook; weekly summaries Monday at 09:00 Asia/Karachi. Repeat reminders use elapsed 24-hour/7-day intervals, not daylight-saving wall-clock recurrences. Jobs coalesce missed repeat times and use database idempotency keys. n8n and the API must remain running; this is not an emergency notification system.

All delivered reminders are **in-app notifications**. Medication/follow-up notices go to the patient. Escalation notices go to the patient and staff in the assigned clinic (plus admins), with no test values in the automation payload. The clinic queue is created immediately by deterministic API processing even if n8n is stopped. Email, SMS, WhatsApp, and push are not configured. To add a channel later, use a dedicated n8n delivery credential and generic notifications linking back to the authenticated application; do not send reports or values through n8n.

Optional CLI import, after creating the n8n owner account:

```powershell
node scripts/prepare-n8n-credentials.mjs
docker compose cp ../work/n8n-credentials.private.json n8n:/tmp/careloop-credentials.json
docker compose exec n8n n8n import:credentials --input=/tmp/careloop-credentials.json
docker compose exec n8n n8n import:workflow --separate --input=/workflows
docker compose exec n8n rm /tmp/careloop-credentials.json
Remove-Item -LiteralPath ../work/n8n-credentials.private.json
```

The optional script creates a sensitive temporary file outside the repository. Never commit it. Assign imported workflows/credentials to your owner project if prompted. Publish only after checking credentials and testing. The CLI import does not publish workflows.

After import and publication, run `node scripts/test-automation.mjs` from the repository root to verify all four workflows and patient/clinic inbox delivery using synthetic fixtures. This requires the running local Compose stack and Docker CLI access. n8n may warn that its optional Python task runner is unavailable; these workflows use Schedule, Webhook, and HTTP Request nodes, with no Python Code nodes.

## Signed API webhook

`POST /api/automation/webhook` accepts body `{"kind":"escalation"}` and requires the automation bearer token plus `X-CareLoop-Timestamp` (epoch milliseconds), `X-CareLoop-Nonce` (16–80 URL-safe characters), and `X-CareLoop-Signature` (hex HMAC-SHA256 of `timestamp + '.' + nonce + '.' + exactRawBody`, keyed by `AUTOMATION_WEBHOOK_SECRET`). The API rejects altered bodies, timestamps outside five minutes, and reused nonces. This endpoint is distinct from n8n's header-authenticated `/webhook/careloop-clinic-review`.

## Troubleshooting

- **`npm ci` cannot find a lockfile:** run it inside the extracted repository root, where `package-lock.json` exists, not `D:\CareLoop`.
- **`next` not recognized:** install from the root with `npm ci` first. Do not install Next globally.
- **Native SWC / invalid Win32 application:** use Node 24 x64, ensure free disk space, reinstall dependencies, or temporarily run `npm run dev --workspace @careloop/frontend -- --webpack`. Turbopack requires working native bindings; Webpack supports the WASM fallback. Set `NEXT_SWC_PATH` to a writable cache directory with space if needed.
- **Docker engine pipe missing:** open Docker Desktop and wait for the Linux engine to finish starting.
- **Upload fails:** confirm file signature and MIME, maximum 10 MB, matching API/AI service tokens, and a running AI service. Scanned PDFs need the Docker Tesseract installation; native Windows needs Tesseract with `eng` and `urd` language data.
- **Photo extraction times out on a small machine:** Docker sets `OMP_THREAD_LIMIT=1` to avoid Tesseract thread contention. For native Python, set that environment variable before starting the AI service. On this machine it reduced a synthetic-photo OCR attempt from exceeding the 25-second limit to about four seconds. See [Tesseract's threading guidance](https://tesseract-ocr.github.io/tessdoc/FAQ.html).
- **All values need verification:** complete the synthetic adult profile; verify units and test aliases. Unknown, duplicated, censored (`<`/`>`), ambiguous, or unsupported values intentionally require review.
- **Reminder not appearing:** publish n8n workflows, verify the Header Auth credential, make a reminder due, and inspect the in-app inbox. Pausing/deleting a medication pauses its linked reminders; resuming it does not silently resume them.
- **Login fails after editing seed password:** seeding never resets an existing password. Restore the original local password or create another fictional patient account.
- **CORS rejection:** use `http://localhost:3000` with local Compose, or configure the exact HTTPS frontend origin when hosted.
