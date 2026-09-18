<div align="center">
  <img src="docs/logo.png" width="112" alt="RepoMarks logo" />

  # RepoMarks

  **Bookmarks, evolved — stored in your own Git repository.**

  No database. No managed backend. Your links, snapshots and highlights live as plain files in a repo you own.

  [![Docker](https://github.com/RepoMarks/repomarks/actions/workflows/docker.yml/badge.svg)](https://github.com/RepoMarks/repomarks/actions/workflows/docker.yml)
  ![Version](https://img.shields.io/github/package-json/v/RepoMarks/repomarks)
  ![License](https://img.shields.io/github/license/RepoMarks/repomarks)
  ![Stars](https://img.shields.io/github/stars/RepoMarks/repomarks)

  [中文文档](README-CN.md) · [Roadmap](ROADMAP.md) · [Browser extension](extension/) · [Quick start](#-quick-start)

  <img src="docs/logo.png" width="0" height="0" alt="" />
</div>

---

## 💡 Why RepoMarks?

Most bookmark managers keep your data in their database. RepoMarks keeps it in **your Git repository**:

- **You own the storage** — the app only clones the repo, edits files, and pushes. Backups are `git clone`, history is `git log`, migration is changing one URL.
- **Plain, readable files** — links are JSONL, collections are JSON, preserved pages are gzipped HTML next to screenshots and PDFs. Grep it, diff it, edit it by hand.
- **Multi-device by nature** — every instance pulls and pushes the same repository; conflicts are merged per record (newest `updatedAt` wins).
- **No infrastructure** — no Postgres, no Redis, no object storage. One container plus a private repo is the whole stack.

## ✨ Features

**📥 Collect**
- Paste a URL and get title, description, site name, favicon and OG image automatically
- Import browser bookmarks (Netscape HTML from Chrome / Edge / Firefox) and JSON exports, including Linkwarden
- Upload images / PDFs / HTML as bookmarks, or attach your own SingleFile / PDF / screenshot files to any link
- Browser extension (side panel + context menu), bookmarklet, PWA share target, iOS/Android "share to app"

**🏛️ Preserve**
- Multi-format snapshots kept in the repo: single-file **HTML**, **reader** text, full-page **screenshot**, **PDF**, and optional **Wayback Machine** submission
- Git LFS is enabled automatically for `archives/**` and `files/**` so clones stay small
- Scheduled refresh re-preserves stale pages; per-format cleanup and a history-slimming script when the repo grows

**📖 Read & annotate**
- Reader view of the preserved text, highlight passages in 5 colors and attach notes
- Full-text search across preserved pages, with match snippets (`site:`, `after:`, `before:`, `is:pinned`, `is:dead`, `is:read`, …)
- Read-later queue with unread/read state, bulk actions for tags, collections, pinning, preservation and deletion

**🗂️ Organize & find**
- Nested collections with colors, icons and manual ordering; tags with rename/merge/delete
- Pin links, write notes, customize icons, detect and merge duplicates
- Dead-link checker with HTTP status history

**🌐 Share & sync**
- Public collections with a read-only page, RSS feed, optional **password + expiry**
- Mirror external RSS feeds into a collection automatically
- Linkwarden-compatible `/api/v1` endpoints for Floccus and other clients; per-client **API keys**
- Export everything as JSON or Markdown, and generate `index/*.md` collection indexes for browsing on GitHub

**🤖 AI (optional)**
- Tag and summary suggestions through any OpenAI-compatible API
- Semantic search and **"Ask AI"** chat over your preserved pages — embeddings are stored in the repo

**🛠️ Ops**
- Single password login, dark/light/system theme, PWA-installable, English & 中文 UI
- Docker healthcheck, `/api/health`, background sync, `BASE_PATH` support for reverse proxies

## 🚀 Quick start

### 1. Create a data repository

Create a **private** empty repository on GitHub / Gitea / GitLab, e.g. `link-data`.

### 2. Run it

```bash
# clone this project, then:
cp .env.example .env      # set REPO_URL, GIT_TOKEN and AUTH_PASSWORD
docker compose up -d
```

Open `http://localhost:3000` and sign in. The container ships with `git`, `git-lfs` and `chromium`, so full-fidelity preservation works out of the box.

<details>
<summary>Run without Docker</summary>

```bash
npm install && npm run build && npm start
```
Node 20+ and `git-lfs` (optional, for LFS storage) are required.
</details>

<details>
<summary>Run with plain docker run</summary>

```bash
docker run -d --name repomarks -p 3000:3000 \
  -e REPO_URL=https://github.com/you/link-data.git \
  -e GIT_TOKEN=github_pat_xxx \
  -e AUTH_PASSWORD=your-password \
  -v "$PWD/data:/data" \
  ghcr.io/repomarks/repomarks:latest
```
Image tags: `latest`, `vX.Y.Z`, `main`, `sha-xxxxxxxx`.
</details>

### 3. Create an access token

The service reads and writes the repository over HTTPS with a minimal-scope token. It is stored only in `.env` and never written into `.git/config`.

<details>
<summary><b>GitHub</b> (fine-grained token recommended)</summary>

1. Open <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** → `Only select repositories` → your data repository
3. **Permissions → Contents** → `Read and write`, everything else `No access`
4. Generate and copy `github_pat_...` into `GIT_TOKEN`; keep `GIT_USERNAME=x-access-token`

*Classic tokens (`repo` scope) also work but grant access to all your repositories.*
</details>

<details>
<summary><b>Gitea</b></summary>

1. Avatar → Settings → Applications → Manage Access Tokens
2. Permissions: `repository` **Read and Write**
3. Put the token in `GIT_TOKEN`, set `GIT_USERNAME` to your username
</details>

<details>
<summary><b>GitLab</b></summary>

1. Avatar → Edit profile → Access tokens → scope `write_repository`
2. Put the token in `GIT_TOKEN`, set `GIT_USERNAME=oauth2`
</details>

<details>
<summary><b>SSH instead of a token</b></summary>

```ini
REPO_URL=git@github.com:you/link-data.git
GIT_SSH_KEY=/path/to/id_ed25519   # mount into the container for Docker
GIT_TOKEN=
```
</details>

## ⚙️ How it works

```
Browser ──HTTP──▶ RepoMarks ──git pull/push──▶ data repository (GitHub / Gitea / GitLab)
                     │
                     ├── local clone (DATA_DIR)
                     ├── in-memory index (search, tags, embeddings)
                     └── archives/ · files/ · index/ (LFS-tracked)
```

On every write the service updates files, commits locally, then pushes in the background. If the push is rejected, it fetches and merges — `links/*.jsonl` and `collections.json` conflicts are merged per record (`id` union, newest `updatedAt` wins). Background polling pulls changes made on other devices, or directly in the repo.

## 🗃️ Repository layout

```
meta.json                repository metadata
collections.json         collections
links/0000.jsonl         link shards (1000 records per file, one JSON per line)
archives/<id>.html.gz    preserved HTML (single-file, gzipped)
archives/<id>.txt.gz     reader-mode text
archives/<id>.png        screenshot
archives/<id>.pdf        PDF
files/<id>.<ext>         uploaded files
index/search.jsonl       full-text index
index/embeddings.jsonl   AI embeddings
index/*.md               generated collection indexes
```

<details>
<summary><b>Environment variables</b></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `REPO_URL` | required | Data repository URL (HTTPS or SSH) |
| `GIT_TOKEN` | - | HTTPS access token; leave empty for SSH |
| `GIT_USERNAME` | `x-access-token` | GitHub: keep default · Gitea: your username · GitLab: `oauth2` |
| `GIT_BRANCH` | `main` | Branch |
| `GIT_SSH_KEY` | - | SSH private key path |
| `GIT_LFS` | `auto` | `auto` / `true` / `false` — LFS for `archives/**` and `files/**` |
| `DATA_DIR` | `./data` | Local clone directory (`/data` in Docker) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `BASE_PATH` | - | Sub-path deployment, e.g. `/repomarks` |
| `AUTH_PASSWORD` | - | Login password (leaving it empty disables auth) |
| `SESSION_SECRET` | derived | Session signing secret |
| `SHARD_SIZE` | `1000` | Records per JSONL shard |
| `SYNC_INTERVAL` | `60` | Background sync interval in seconds |
| `FETCH_TIMEOUT` | `15000` | Metadata fetch timeout (ms) |
| `ARCHIVE_ENGINE` | `auto` | `auto` / `singlefile` / `basic` / `off` |
| `ARCHIVE_FORMATS` | `html,readable,screenshot,pdf` | Preservation formats (`wayback` opt-in) |
| `ARCHIVE_WAYBACK` | `false` | Submit pages to the Wayback Machine |
| `ARCHIVE_BROWSER_PATH` | auto | Chrome/Chromium path for full archives |
| `ARCHIVE_BROWSER_ARGS` | - | Extra browser args (Docker: `--no-sandbox,--disable-dev-shm-usage`) |
| `ARCHIVE_TIMEOUT` | `90000` | Timeout per preservation (ms) |
| `REFRESH_ARCHIVE_DAYS` / `REFRESH_ARCHIVE_LIMIT` | `0` / `5` | Re-preserve snapshots older than N days |
| `FEED_SYNC_INTERVAL_HOURS` | `0` | Sync collection RSS feeds every N hours |
| `FULLTEXT_INDEX` / `FULLTEXT_MAX_CHARS` | `true` / `2000` | Full-text index and per-link character budget |
| `ALLOW_PRIVATE_URLS` | `false` | Allow fetching private/internal addresses |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | - | OpenAI-compatible endpoint for AI features |
| `AI_EMBEDDING_MODEL` | - | Embedding model for semantic search |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `RepoMarks` / `repomarks@localhost` | Commit author |

</details>

<details>
<summary><b>REST API</b></summary>

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Log in with `{password}` |
| GET | `/api/links` | Search (`q`, `collection`, `tag`, `archived`, `read`, `sort`, `order`, `page`, `perPage`) |
| POST | `/api/links` | Create a link (`fetchMetadata: false` skips scraping) |
| POST | `/api/links/bulk` | Bulk `addTags` / `removeTags` / `setCollection` / `pin` / `read` / `archive` / `delete` |
| POST | `/api/links/check` | Dead-link check (`ids` optional) |
| PATCH / DELETE | `/api/links/:id` | Update / delete |
| POST | `/api/links/:id/archive` | Preserve (async) |
| GET | `/api/links/:id/archive` | View archive (`?format=readable\|screenshot\|pdf`) |
| POST | `/api/links/:id/ai` | AI tags & summary |
| POST | `/api/ai/embed` / `/api/ai/search` / `/api/ai/chat` | Semantic index, search and Q&A |
| POST | `/api/collections/:id/feed/sync` | Sync a collection's RSS feed |
| GET / PATCH / DELETE | `/api/collections` | Collections |
| PATCH / DELETE | `/api/tags/:tag` | Rename / delete a tag |
| POST | `/api/import` · GET `/api/export?format=markdown` | Import and export |
| GET | `/api/health` · `/api/status` · POST `/api/sync` | Health, status, manual sync |
| — | `/api/v1/*` | Linkwarden-compatible API (API key auth) |

Authenticate with the session cookie or `Authorization: Bearer <API key>` / `X-API-Key`.
</details>

## 🧩 Clients

- **Browser extension** — [`extension/`](extension/): popup, side panel, context menus, `Ctrl+Shift+S`
- **API keys** — Settings → API keys; use them for scripts, shortcuts and third-party apps
- **Floccus & friends** — point Linkwarden-compatible clients at `/api/v1`
- **Bookmarklet** — drag the link from Settings → Save bookmarklet to your bookmarks bar
- **PWA** — install from the browser; the share target receives URLs from mobile share sheets

## 🧪 Development

```bash
npm install
npm run dev        # backend :3000 (tsx watch) + frontend :5173 (Vite)
npm run typecheck
npm run build
npm run smoke      # core + HTTP smoke tests on temporary bare repos
```

`scripts/` also contains utilities: `migrate-to-lfs.mjs`, `repo-slim.mjs`, `github-e2e.mjs`, `check-i18n.ts`, `make-icons.mjs`.

## ⚠️ Known limitations

- **Single user** — one deployment, one password, one repository; run several instances for several people
- **Conflict merging** — per record, newest `updatedAt` wins; field-level merges are not attempted
- **Repository growth** — snapshots add up; use Git LFS, per-format cleanup and `scripts/repo-slim.mjs`
- **No browser** — the lightweight inliner is limited; the Docker image ships with Chromium
- **Anti-bot pages** — 403/CAPTCHA targets can make scraping or preservation fail; the UI shows the error

## 📄 License

[MIT](LICENSE)
