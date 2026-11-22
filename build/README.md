# CareLoop

For the existing **D:\CareLoop Git repository**, use the [deployment handover](../DEPLOYMENT.md). Its Vercel root is `build/frontend`; its Render root directory is `build`. Cloud setup uses `npm run setup:deployment` and keeps cloud credentials separate from the local `.env` files. The generic guide below also supports standalone exports where this directory itself is the repository root.

A synthetic-data health companion for understanding lab reports in English and Urdu. Next.js patient and clinic screens, an Express API, PostgreSQL/pgvector, a LangGraph/FastAPI AI service, and n8n workflows run together with Docker Compose.

**This is a demonstration, not a clinical service.** Use fictional accounts and the supplied synthetic reports only. The 20 seeded test ranges are unverified engineering fixtures awaiting your source review. CareLoop does not diagnose, prescribe, or change medication. Discuss results with your doctor.

## Run everything

Prerequisites: Docker Desktop with the Linux engine running, Node.js 24, and enough disk/RAM for five services. The first image build downloads dependencies and OCR language data.

```powershell
cd D:\CareLoop\build
npm run setup:env
docker compose up -d --build
docker compose ps
```

On another computer, change the first command to your extracted repository path. The setup script itself needs no installed npm packages. Compose applies migrations and seeds fictional accounts before starting the API.

- CareLoop: **http://localhost:3000**
- n8n: **http://localhost:5678** — create its separate local owner account, then follow [configuration](docs/CONFIGURATION.md#configure-n8n).
- API health: **http://localhost:4000/health**; database readiness: `/ready`.
- AI health: **http://localhost:8000/health**.
- Fictional login credentials: local private file **`../work/LOCAL-DEMO-ACCOUNTS.txt`**. Emails: `sarah@example.test`, `ali@example.test`, `clinic@example.test`, `admin@example.test`.

Start with `AI_MODE=offline`; the report workflow needs no paid keys. Upload a PDF or PNG from `evals/fixtures`. Use a patient account to upload, record existing medication instructions, and set reminders. Use the clinic account to inspect deterministic flags and write review notes. Switch to Urdu in the header for RTL layout and Urdu explanations.

**Keys, variables, n8n and troubleshooting:** [Configuration guide](docs/CONFIGURATION.md). **Hosted setup:** [Deployment guide](docs/DEPLOYMENT.md). **Implementation and limitations:** [Architecture](docs/ARCHITECTURE.md). **Phase summaries:** [Build phases](docs/PHASES.md).

## Repository

```text
frontend/       Next.js App Router, TypeScript, Tailwind, shadcn/ui foundation,
                next-intl, React Query, Recharts, patient + clinic screens
api/            Express, JWT rotation, RBAC, encrypted data, deterministic engine
  drizzle/      Drizzle SQL migration + journal
ai/             FastAPI, LangGraph, PDF/OCR extraction, grounded explanations/chat
automation/     Four importable n8n workflows (inactive until configured/published)
evals/          32 synthetic PDFs + 8 photos, generator, metric runner
infra/          PostgreSQL initialization
scripts/        Environment generation, workflow export, end-to-end smoke check
docs/           Configuration, deployment, architecture, phase and validation notes
.github/        CI: types, build, API/AI tests, evaluation and Compose smoke
```

## Native development

```powershell
npm ci
npm run setup:env
docker compose up -d postgres ai
npm run build --workspace @careloop/api
npm run db:seed --workspace @careloop/api
npm run dev:api
```

In another terminal, from the root: `npm run dev:frontend`. Do not run the Compose API/frontend simultaneously on the same ports. Native development accepts localhost and 127.0.0.1 origins. Compose production uses localhost.

For native Python instead of the AI container:

```powershell
py -3.11 -m venv ../work/venv
../work/venv/Scripts/python -m pip install "./ai[dev]"
cd ai
../../work/venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

For photo/scanned-PDF extraction, install Tesseract with `eng` and `urd` language data and set `TESSERACT_CMD`. The AI Dockerfile includes these. Text PDFs do not require local Tesseract. On Linux/macOS, use the venv's `bin/python` path instead of `Scripts/python`.

## Tests

```powershell
npm ci
npm run typecheck
npm test
$env:RUN_INTEGRATION='true'
npm run test:integration --workspace @careloop/api
npm run build
```

Integration tests use a separate `careloop_test` database and the generated API environment. They require a running PostgreSQL instance and a role permitted to create that test database. Never point this demo at a database containing real records.

```powershell
../work/venv/Scripts/python -m mypy --config-file ai/pyproject.toml ai/app
Push-Location ai
../../work/venv/Scripts/python -m pytest
Pop-Location
../work/venv/Scripts/python evals/run.py --pdf-only
```

Full OCR evaluation: omit `--pdf-only` with local Tesseract installed, or run against the AI container by setting `AI_SERVICE_TOKEN` in the current process and using `--url http://localhost:8000`. Read the token locally from `.env`; never print it. Run `python evals/generate_fixtures.py` to regenerate the 40 fixtures. `--live` enables a configured live provider for local evaluation; for HTTP evaluation also configure/restart the server in live mode.

With all services running: `node scripts/e2e.mjs` tests real PDF and PNG uploads through the frontend proxy, processing, statuses, bilingual explanation, guarded chat, and clinic access. The script deletes only reports it created. `npm run test:ui` runs the browser smoke suite against the running application; see [validation notes](docs/VALIDATION.md).

Evaluation reports contain aggregate metrics only. Their narrow synthetic templates do not establish accuracy on arbitrary real lab layouts, poor photos, Urdu OCR, or clinical safety. Live LLM providers require their own evaluation with your keys.

## Safety design

Status and escalation are decided by `api/src/status.ts` using versioned `reference_ranges`, exact units, age/sex context, confidence and source evidence. The LLM has no authority to choose statuses, ranges, or clinic flags. Unknown/ambiguous/censored observations fail closed for human verification. Explanations are constrained to retrieved reviewed sentences and safe templates, with a doctor pointer. Chat uses only the selected report and retrieved content.

Sensitive payloads use AES-256-GCM with record-specific authenticated context; passwords use scrypt; emails have keyed lookup hashes; refresh tokens are stored as hashes. Access to patient data is audited before plaintext is returned. Audit rows are append-only at application/database-trigger level. No raw reports, chat bodies, or provider prompts are logged. Optional traces contain only mode/locale/attempt counts.

This build is adult-only, synthetic-only, and single-clinic by default. It does not claim HIPAA compliance, real clinical verification, guaranteed reminder delivery, or production security certification. The clinic queue is not an emergency service.
