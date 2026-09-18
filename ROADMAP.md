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

## Batch 2 — Everyday workflow

- [ ] Collection color picker and manual ordering
- [ ] PWA share target + save bookmarklet
- [ ] Duplicate link handling UI (jump to / merge the existing link)
- [ ] Read later: read/unread state and a reading queue view
- [ ] Scheduled re-preservation (refresh snapshots every N days)
- [ ] Archive slimming: keep the latest N versions, warn on oversized archives

## Batch 3 — Integrations

- [ ] Full-text search inside preserved pages (index stored in the repo)
- [ ] Floccus-compatible API for browser bookmark sync
- [ ] Browser extension: side panel, save selected text as a highlight, keyboard shortcut
- [ ] Encrypted public shares (password + expiry)
- [ ] `BASE_PATH` support for reverse-proxy sub-paths
- [ ] External RSS feeds mirrored into a collection

## Batch 4 — Differentiators

- [ ] AI semantic search and "chat with your bookmarks" (embeddings stored in the repo, Ollama/OpenAI)
- [ ] Multi-user, multi-repository mode (user registry in a parent directory repo)

## Out of scope

- [-] Team permissions, SSO/2FA, user administration — conflicts with the single-user, one-repository design
