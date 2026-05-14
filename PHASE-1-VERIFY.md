# NFTones — Phase 1 + 2 Verify Report

**Captured:** 2026-05-13
**Discipline:** Fortune-500 (DISCOVER → BASELINE → ISOLATE → APPLY → VERIFY)
**Scope:** stand up `services/nftones-api` (FastAPI orchestrator) and wire the
frontend through a flag-gated data source. Demo mode unchanged.

---

## What changed (baseline → verify hash diff)

```
File                       Baseline SHA-256       Verify SHA-256        Status
─────────────────────────  ─────────────────────  ─────────────────────  ──────────────
web/index.html             21841EAF…              57398503…              MODIFIED  (config block + script tags)
web/app.js                 4532FC72…              61CC5505…              MODIFIED  (bootstrap refactor — hydrate via DS)
web/styles.css             F1E951D3…              F1E951D3…              UNCHANGED ✓
mock-data/data.js          8DD6DA1F…              8DD6DA1F…              UNCHANGED ✓ (frozen per user decision)
README.md                  2CD75C88…              2CD75C88…              UNCHANGED ✓
HANDOFF.md                 CD4AC043…              CD4AC043…              UNCHANGED ✓
mock-data/data.json        —                      EEB1D5AB…              NEW (server-side mirror of data.js)
web/dataSource.js          —                      9154D892…              NEW (read seam between UI and data)
services/nftones-api/**    —                      (16 new files)         NEW (FastAPI service + tests)
```

Full file-by-file hash listings are saved at:
- `BASELINE-2026-05-13.txt` (pre-change)
- `PHASE-1-VERIFY-2026-05-13.txt` (post-change)

## ISOLATE pattern in use

**Feature flag**, named `window.NFTONES_CONFIG.useApi`, defaulting to `false`.

- With `useApi: false` (default ship state):
  - `app.js` initializes `D = window.NFTONES_MOCK` synchronously, identical to before
  - `DS.hydrateAll()` resolves on the same tick with the same references
  - No network calls
  - **No observable change to demo behavior**
- With `useApi: true`:
  - `D` starts as an empty shape
  - `DS.hydrateAll()` fetches from `apiBase` (default `/api/v1`)
  - First paint waits for the API responses
  - Crumb surfaces "Data source unavailable — check console" if the API is down

## What was verified in-session

| Check | Result |
|---|---|
| All 17 Python files compile (`py_compile`) | ✅ 17 ok, 0 fail |
| `mock-data/data.json` parses + counts match fixture (12 wallets, 3 releases, 16 grants, 3 scans, 1 evidence, 11 token events) | ✅ |
| `web/styles.css`, `mock-data/data.js`, `README.md`, `HANDOFF.md` byte-identical to baseline | ✅ |
| `python -m http.server` serves all paths 200 (index.html, dataSource.js, app.js, data.js, data.json) | ✅ |
| `NFTONES_CONFIG` block present in `index.html` with `useApi: false` default | ✅ |

## What was NOT verified in-session (honest gaps)

| Check | Why blocked | How you verify |
|---|---|---|
| `pytest` runtime — contract tests pass | Sandbox has no PyPI access; cannot `pip install` | See "Run on your end" below |
| Docker build succeeds | Docker daemon not running in sandbox | `docker compose build` on your box |
| Browser renders both modes correctly | No browser in sandbox | Load `http://localhost:8000/web/` in Chrome/Firefox |
| End-to-end frontend → API → SQLite round-trip | Requires API booted + browser | Steps below |

Per St-Claudly-Clooright Vow 1 (no claims without verification): **the code
is written and syntactically valid; the runtime tests have not been executed
in this session.** You run the commands below to close the loop.

## Run on your end (5 minutes)

### 1. Verify demo mode is unchanged (useApi: false)

```powershell
cd C:\Users\chaza\NFTones
python -m http.server 8000
# Open http://localhost:8000/web/ in browser
# Expected: dashboard renders, all 7 views work, leak-check demos run.
# This should be visually identical to the pre-change demo.
```

### 2. Boot nftones-api

```powershell
cd C:\Users\chaza\NFTones\services\nftones-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn src.main:app --port 8600

# In a separate shell:
curl http://localhost:8600/api/v1/health
# Expected: {"ok":true,"data":{"status":"ok","service":"nftones-api"},"cost_ktrs":"0.00"}

curl http://localhost:8600/api/v1/releases | python -m json.tool
# Expected: ok:true, data: 3 releases matching mock-data/data.json
```

### 3. Run contract tests

```powershell
cd C:\Users\chaza\NFTones\services\nftones-api
.\.venv\Scripts\Activate.ps1
pytest -q
# Expected: 17 passed (5 health/version + 12 endpoint contracts)
```

### 4. Switch frontend to API mode

Edit `web/index.html`, change:

```javascript
window.NFTONES_CONFIG = {
  useApi: true,
  apiBase: "http://localhost:8600/api/v1",
};
```

Reload `http://localhost:8000/web/`. Dashboard should render identical data,
this time fetched live from the API. Check browser DevTools → Network tab to
confirm `/api/v1/wallets`, `/api/v1/releases`, etc. are called.

### 5. Docker parity (optional — Hetzner deploy preview)

```powershell
cd C:\Users\chaza\NFTones\services\nftones-api
docker compose up --build
curl http://localhost:8600/api/v1/health
```

## Rollback (Fortune-500 APPLY: written before deploy)

If anything breaks, **single command** restores the prior state:

```powershell
# Stop the API service:
cd C:\Users\chaza\NFTones\services\nftones-api
docker compose down 2>$null
# Or if running uvicorn directly: Ctrl+C in that shell.

# Restore frontend (revert the two surgical changes — copy from the file headers):
#   - web/index.html: remove the NFTONES_CONFIG <script> block + dataSource.js <script>
#   - web/app.js: revert the IIFE header + init block to use D = window.NFTONES_MOCK directly

# Remove the new artifacts (optional — they're inert when useApi:false):
Remove-Item C:\Users\chaza\NFTones\web\dataSource.js
Remove-Item C:\Users\chaza\NFTones\mock-data\data.json
Remove-Item -Recurse C:\Users\chaza\NFTones\services\nftones-api
```

In practice once this is in git: `git revert <phase-1-sha>` is the one-shot
rollback. The demo path (data.js, styles.css) is untouched by these changes,
so even without revert, flipping `useApi: false` (default) restores demo
behavior immediately.

## What's NOT in Phase 1 (deliberate scope guardrails)

These are next-phase work, NOT regressions:

- **No write endpoints** (POST /releases, /access, /revoke, /scans). Phase 5
  after wallet-signature auth ships.
- **No real watermarker integration**. `nftones-api` exposes scans/evidence
  from the frozen fixture; Phase 6 wires POST /scans → `audio_watermarker`.
- **No wallet auth, no JWT, no rate limiting**. Phase 5.
- **No Postgres**. SQLite is intentional for Phase 1 (zero infra). Postgres
  migration is Phase 8 via Alembic.
- **No on-chain Solana calls**. Phase 7 deploys the Anchor program to devnet.
- **No code-signing certs / Play Console account / privacy policy**. Phases
  3, 4, and 8 respectively — they require your accounts and lawyer review.

## Pointers to Phase 3+ work (not started yet)

When you say go, the next phases are:

- **Phase 3** — Tauri desktop shell (`desktop/` with `tauri.conf.json`)
- **Phase 4** — Cloudflare Pages deploy of the web bundle + Bubblewrap AAB
- **Phase 5** — wallet-signature auth
- **Phase 6** — watermarker wiring
- **Phase 7** — Anchor program on devnet
- **Phase 8+** — Postgres, Authenticode signing, audits, store submission

Each phase is its own DISCOVER → BASELINE → ISOLATE → APPLY → VERIFY cycle.
