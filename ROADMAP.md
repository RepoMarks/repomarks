# RepoMarks Roadmap

Batch plan and progress tracker. Each batch is implemented, tested (`npm run smoke`), committed and deployed in order.

Legend: `[x]` done · `[~]` in progress · `[ ]` planned · `[-]` out of scope

## Batch 1 — Small wins ✅ (released)

- [x] **Tag management page** — rename / merge / delete tags across all links (`/tags`)
- [x] **Dead link checker** — HEAD/GET check per link, `is:dead` filter, bulk check, manual check on the detail page
- [x] **Markdown export** — download all links as Markdown (`/api/export?format=markdown`), copy a single link as Markdown, generate `index/*.md` collection indexes committed to the repo
- [x] **Search syntax** — `site:`, `after:`, `before:`, `is:pinned`, `is:dead`, `is:failed`, `is:archived`, with keyword highlighting in results
- [x] **Server error i18n** — API error messages follow the UI language (`x-ui-language` / `Accept-Language`)
- [x] **Health endpoint** — `/api/health` + Docker `HEALTHCHECK`

Smoke coverage: `16c`–`16i` in `scripts/http-smoke.mjs`.

## Batch 2 — Everyday workflow ✅ (released)

- [x] Collection color picker and manual ordering (up/down, stored as `order`)
- [x] PWA share target (`/share-target`) + save bookmarklet (Settings)
- [x] Duplicate link handling UI — 409 responses carry `details.existingId`, with "open existing" / "merge into existing"
- [x] Read later: `readAt`, `is:read` / `is:unread`, Read later view, bulk mark read/unread
- [x] Scheduled re-preservation — `REFRESH_ARCHIVE_DAYS` / `REFRESH_ARCHIVE_LIMIT`, plus a manual button in Settings
- [x] Archive slimming — largest-archive report, per-format deletion, and `scripts/repo-slim.mjs` for history rewrites

Smoke coverage: `16j`–`16n` in `scripts/http-smoke.mjs`.

## Batch 3 — Integrations ✅ (released)

- [x] Full-text search inside preserved pages — `index/search.jsonl` stored in the repo, in-memory match + snippets, rebuild endpoint
- [x] Linkwarden-compatible API (`/api/v1/*`) for Floccus and other clients (Bearer API key)
- [x] Browser extension: side panel, "save selection as highlight" context menu, existing keyboard shortcut
- [x] Encrypted public shares — scrypt password + expiry, cookie-based unlock, form page
- [x] `BASE_PATH` support for reverse-proxy sub-paths (server mount + `VITE_BASE_PATH` build)
- [x] External RSS feeds mirrored into a collection (`feedUrl`, manual sync + `FEED_SYNC_INTERVAL_HOURS`)

Smoke coverage: `16o`–`16r` in `scripts/http-smoke.mjs`, plus the standalone base-path check.

## Batch 4 — Differentiators

- [ ] AI semantic search and "chat with your bookmarks" (embeddings stored in the repo, Ollama/OpenAI)
- [ ] Multi-user, multi-repository mode (user registry in a parent directory repo)

## Out of scope

- [-] Team permissions, SSO/2FA, user administration — conflicts with the single-user, one-repository design
