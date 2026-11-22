# CareLoop

Synthetic-only lab report companion with English/Urdu interfaces, deterministic status checks, grounded explanations, clinic review, and private reminders.

**Start deployment here: [DEPLOYMENT.md](DEPLOYMENT.md).** This repository is rooted at `D:\CareLoop`; application source lives in `build/`. Upload this folder's contents to GitHub, including this README, root `render.yaml`, `.github`, and `build/`. Never upload `work/`.

| Task | Command / location |
| --- | --- |
| Local development | `cd build`, then see [application README](build/README.md) |
| Generate separate cloud secrets and imports | From `build`: `npm run setup:deployment` |
| Check deployment inputs | From `build`: `npm run check:deployment` |
| Check files before a GitHub push | From `build`: `npm run check:github` |
| Render API + AI | Root [render.yaml](render.yaml), or manual settings in the handover |
| Vercel Root Directory | **`build/frontend`**, Node **24.x** |
| Database | Neon PostgreSQL with pgvector; Supabase alternative in the handover |
| Private cloud imports and keys | `work/deployment/` (ignored by Git) |

Source includes synthetic fixtures, unit/integration tests, browser checks, evaluation scripts and GitHub Actions. The root GitHub workflow accounts for the `build/` layout. The workflow inside `build/.github` is only for a standalone export with `build/` as its Git root.

The hosted service remains a synthetic demonstration. Seeded reference ranges await source verification. CareLoop does not diagnose, prescribe, or change medication; notifications currently appear in its inbox. No hosting resources are created by the setup scripts.
