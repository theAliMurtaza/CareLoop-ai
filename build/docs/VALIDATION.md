# Validation record

Deployment preparation (22 November 2026): the existing Git root is `D:\CareLoop`, with the application under `build/`. Root GitHub Actions paths and Render build contexts were checked. The root Render Blueprint passed the official Render JSON Schema. Two cloud-configuration tests passed (secret reuse/local isolation/export consistency and rejection of incomplete/insecure inputs); formatting and the Git candidate scan passed. All four existing local `.env` files were unchanged. Cloud URLs/database credentials are intentionally pending in `build/deployment/.env`; no cloud deployment or remote CI run was performed. See the root `DEPLOYMENT.md` handover.

Local verification on Windows, Node 24 and Python 3.11, 21 November 2026. See `evals/results` for machine-readable metrics. GitHub Actions is provided but has not been run on a remote repository in this session.

Completed checks:

- Strict TypeScript checks for frontend/API; production Next.js and API builds.
- 23 deterministic/API unit checks, including exact boundaries, invalid/ambiguous context, a 1,000-value sweep, encryption tampering and webhook signatures.
- 10 integration tests against real PostgreSQL, covering JWT refresh rotation/reuse, ownership/RBAC, cross-site mutation rejection, encrypted storage, upload validation, medication/reminder linkage, idempotency, audit failure/immutability, and critical escalation when explanation generation fails.
- 15 Python tests covering actual text-PDF extraction, source validation, missing units, duplicate/unsupported observations, model invention rejection, guardrail regeneration, source citations, bilingual doctor pointers, authentication and private errors.
- Strict Python mypy checks across all 9 service modules.
- Two headless Microsoft Edge browser scenarios: public desktop/mobile Urdu layouts and authenticated patient/report/chat/trend/list/clinic navigation. No page JavaScript errors or mobile horizontal overflow in the checked scenario.
- PDF evaluation: 32 synthetic PDFs, exact value precision/recall and exact-report accuracy 100%; 34 adversarial cases refused; 32 source-grounded explanations faithful; six benign requests with no diagnosis-refusal false positives.
- Production npm dependency audit: zero reported vulnerabilities at the time of checking. Development tooling reports four moderate advisories through the Drizzle tooling chain; production images prune development dependencies.

The synthetic fixture suite is deliberately narrow. These metrics do not establish performance on arbitrary laboratory layouts, poor-quality images, Urdu-language OCR, live providers, or clinical data. Gemini/Groq/Ollama live calls and optional Langfuse ingestion require your configuration and have not been validated with external credentials.

Browser tests use only fictional accounts. Tracing and automatic screenshots are disabled; optional explicit screenshots show synthetic UI only. To run locally with installed Edge:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:ui
```

For Playwright's bundled Chromium: `npx playwright install chromium`, then run `npm run test:ui` without the channel override. Keep the application running at `http://localhost:3000`, or set `E2E_BASE_URL`.

The initial Docker build exhausted C: because Docker's disk image is stored there. Approximately 6.4 GB of old npm cache was moved intact to `D:\CareLoop\work\npm-cache-from-C`, and additional disk space was freed by the user. Docker/WSL was restarted without deleting database volumes or unrelated images. The source repository's `.npmrc` keeps future npm downloads in `../work/npm-cache`.

All five Compose services were healthy: PostgreSQL/pgvector, API, AI, frontend, and n8n. Real PDF and PNG uploads passed through the Next.js proxy, API, extraction worker, deterministic classification, English/Urdu explanations, guarded chat, and clinic queue.

Full Docker OCR evaluation used 40 fixtures (32 PDFs and eight photos): value precision **100%**, value recall **99.16%** (118/119), and exact-report accuracy **97.5%** (39/40). One OCR omission remains and requires human review. All 34 adversarial guardrail cases were caught; all 32 checked explanations were faithful to their supplied content; none of six benign requests triggered a diagnosis refusal. These are offline-mode results, not live-model performance claims.

The two local n8n credentials and four workflows were imported and published. The production clinic webhook rejected a request without its credential with HTTP 403 and accepted the configured credential with HTTP 200. Exported workflows remain inactive for fresh installations. Notifications stay in the authenticated CareLoop inbox; no external messages were sent.

All four workflows passed actual n8n CLI execution, followed by patient medication/follow-up/weekly inbox checks and a clinic escalation inbox check. The validation script uses asynchronous subprocesses so long CLI startup cannot leave stale HTTP connections.

The AI image was built from its final Dockerfile. Docker's intermittent DNS issue required temporary build-only hostname mappings to fetch dependencies; TLS verification remained enabled and no fixed IPs were added to the repository. Debian packages are fetched over HTTPS. The final image limits Tesseract to one CPU thread: the default multi-threaded OCR exceeded the 25-second budget on this machine, while the same synthetic fixture completed in about four seconds with the limit. Raw OCR text was not logged.
