# Architecture and boundaries

## Request path

Browser → Next.js same-origin `/api/*` proxy → Express API → PostgreSQL and private FastAPI service. n8n calls only authenticated notification-job endpoints. The browser never receives service, database, encryption, or provider keys. Browser access tokens remain in memory; the refresh token is an HttpOnly, SameSite=Lax cookie scoped to `/api/auth`.

The frontend proxy forwards only allowlisted route families and headers, caps buffered bodies, and disables caching. API requests require JWT authentication and database-backed role/active-user checks. Mutations require an explicit client header plus an allowed Origin when present. Helmet, bounded uploads/JSON, authentication throttling, and request limits apply. Hosted deployments should add a proxy/WAF rate limit: frontend server proxying means the API sees the proxy's address, so its in-process limiter is shared across proxied users and not a distributed limit.

## Data model

`users` and `profiles` hold identity/role/clinic and encrypted profile data. `reports` stores encrypted metadata and encrypted original file bytes. `report_values` and `explanations` hold encrypted snapshots. `reference_ranges` stores public versioned engineering fixtures with source and verification fields. `medications`, `reminders`, `follow_ups`, `chat_messages`, `escalations`, and `automation_events` store encrypted sensitive payloads with operational IDs/states/timestamps in plaintext. `audit_logs`, `refresh_tokens`, and `webhook_nonces` support access auditing, rotation, and replay prevention. `knowledge_chunks` contains reviewed synthetic educational text and a 384-dimensional pgvector column.

Drizzle migrations create the schema, vector extension, HNSW index, range ordering constraints, foreign keys, and an audit immutability trigger. DB administrators can bypass application controls; append-only here is not an externally immutable compliance archive. Backups need separate access controls and retained encryption keys.

## Deterministic status

The pure TypeScript engine chooses an unambiguous applicable range for exact test/unit and demographic context. Boundaries are inclusive for normal and critical. Borderline intervals are explicit engineering margins outside normal. High/low/critical statuses generate concerning/critical review entries. Missing context, duplicate low-confidence observations, unmatched units, draft ranges, invalid ranges, or censored values produce `unclassified` and human review. No clinical unit conversion or sex/age inference is performed. Synthetic-only ranges can only be applied in synthetic mode.

The seed contains about 20 common tests. Source labels clearly say **UNVERIFIED synthetic engineering fixture**; the general MedlinePlus URL is a source-review starting point, not evidence supporting the seeded cutoffs. A qualified reviewer must supply lab/method/population-specific sources and validate every boundary before a separate real-data product is considered. Do not flip a verification flag to pretend that process occurred.

The worker claims reports using PostgreSQL row locks and `SKIP LOCKED`, tracks extraction/classification/explanation stages, and retries stale claims up to three times. Model extraction must pass strict schemas. Status snapshots remain attached to the range version used. Explanation failures use a static doctor-directed fallback and do not suppress a successfully computed escalation. Failed extraction shows a retry state; no guessed values are stored.

## AI pipeline

LangGraph: extract text → parse/retry → normalize aliases and flag duplicates. Text PDFs use pdfplumber; image pages and PNG/JPEG use Tesseract `eng+urd`. Limits include 10 MB decoded file, 20 PDF pages, 20 million image pixels, 100,000 text characters, per-OCR timeout and a 60-second cumulative OCR budget. The API queues jobs; the AI service limits concurrent tasks to two and authenticates before reading request bodies.

The regex parser accepts supported test names and explicit units. A live model fallback is accepted only when its evidence is an exact substring of the source and an independent parser confirms test/value/unit/comparator. This deliberately sacrifices layout coverage to avoid invented numbers. Unrecognized tests and unsupported layouts may produce no values and require review. OCR output is still fallible; users must compare it against the original synthetic report.

RAG retrieves reviewed chunks by locale/test and pgvector distance using deterministic lexical feature hashing (384 dimensions). This is **not a pretrained semantic embedding model**. The explanation graph asks a configured LLM to select exact supported sentences, checks membership and guardrails, retries twice, then falls back safely. English/Urdu sections and the doctor pointer are guaranteed by application code. Chat rejects diagnosis/prescribing/dose requests; answers are exact report summaries or retrieved content. It does not browse the web or answer general medical questions.

Offline mode exercises the same boundaries using deterministic extraction and grounded templates without network LLM calls. Live Gemini/Groq/Ollama calls are configurable; optional Langfuse HTTP ingestion sends only locale, attempt count, and execution mode. No automatic LangChain/LangGraph prompt tracing is enabled.

## Automation

n8n workflows send only job kinds and receive notification counts. The API determines due records, writes encrypted inbox notifications, and enforces idempotency. The escalation workflow has a header-authenticated webhook plus a polling schedule. Separately, the API's signed webhook checks bearer token, timestamp, nonce, body HMAC, and replay state. Clinic review itself does not depend on notification delivery.

In-app delivery is implemented. External email/SMS/push delivery is intentionally unconfigured until a delivery provider and recipient-consent requirements are chosen. Notifications survive API restarts in PostgreSQL; schedule punctuality requires n8n and API availability. Local Compose stores n8n state in its own volume and disables execution-content persistence.

## Product scope

Landing, three-step onboarding, overview, uploads with live processing states, report rows/range bars, source evidence, expandable explanations, report chat, trends with normal band and exact table, medication/reminder/follow-up CRUD, and clinic review notes are implemented. English and Urdu UI strings use next-intl locale context and RTL logical styling. Stored test labels/units/source labels and authored record text are retained as entered; not every database field is translated.

The UI includes keyboard focus, labeled forms, loading/empty/error states, text plus icons for status, reduced-motion support, and responsive layouts. A complete assistive-technology accessibility audit remains outside automated smoke coverage. No audio narration, Google OAuth, or fabricated clinical-partner claims are included.
