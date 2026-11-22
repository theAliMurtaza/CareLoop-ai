# Phase handover

The initial scaffold was followed by the user's instruction to continue through completion and provide configuration guidance at the end. These summaries preserve the requested phase-by-phase handover.

| Phase | Built | Run / test | Assumptions |
| --- | --- | --- | --- |
| 1. Scaffold | npm workspaces, five-service Compose, initial bilingual visual foundation | `npm ci`, `npm run typecheck` | Node 24; synthetic demo |
| 2. Database | Drizzle migration, pgvector index, encrypted payload columns, 4 fictional actors, 20 ranges and report history | `npm run build --workspace @careloop/api`, `npm run db:seed --workspace @careloop/api` | Ranges unverified; one seeded clinic; adults only |
| 3. API | JWT/refresh rotation, roles/ownership, CRUD/upload, clinic review, audit log, encryption | `npm test`; `RUN_INTEGRATION=true npm run test:integration --workspace @careloop/api` (PowerShell: set `$env:RUN_INTEGRATION='true'` first) | Refresh cookie through same-origin frontend; no public OAuth |
| 4. Status engine | Exact-context deterministic classification and escalation, boundary/property checks | `npm test` | No model involvement; no inferred units or missing context |
| 5. AI service | LangGraph extraction/explanation, PDF/OCR, grounded chat, safety retry/fallback, provider adapters | AI `pytest`, strict mypy; `/health` | Offline by default; live keys supplied later |
| 6. Frontend | Patient/clinic routes, real API queries, RTL, range bars, trends, forms and states | `npm run build`; `npm run test:ui` against running services | Original image guides palette/layout only; unsupported claims omitted |
| 7. Automation | Four importable n8n workflows, due-job endpoints, private inbox and clinic alerts | Import credentials/workflows, manual test, then publish | In-app delivery; no email/SMS provider configured |
| 8. Evaluations | 40 synthetic fixtures, extraction/guardrail/faithfulness metrics, API and browser integration checks | `python evals/run.py`; `node scripts/e2e.mjs` | Narrow synthetic fixtures are not clinical validation |
| 9. Deployment | Dockerfiles, secret generation/examples, GitHub Actions, hosting instructions | `docker compose up -d --build`; see deployment guide | User creates hosting/provider accounts and supplies keys; no external deployment performed |
