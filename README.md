# RepoMarks

**English** · [中文](README-CN.md)

A self-hosted bookmark manager (in the spirit of [Linkwarden](https://github.com/linkwarden/linkwarden)) where **all data lives in your own Git repository** on GitHub, Gitea, or GitLab. No database, no managed backend, no lock-in.

The service clones your data repository locally, reads and writes plain files, and commits/pushes the changes back. Your backup is the repository itself, your audit log is `git log`, and migrating means pointing the app at another repo URL.

## Features

- Add, edit, and delete links with automatic metadata scraping (title, description, site name, favicon, OG image)
- Collections (nested), tags, pinning, notes, and full-text search (supports `tag:` / `is:archived` prefixes)
- **Multi-format page preservation**, stored gzip-compressed inside the repo and viewable in the app:
  - `html` — single-file HTML archive; uses [single-file-cli](https://github.com/gildas-lormeau/single-file-cli) when Chrome/Chromium is available, otherwise falls back to a lightweight inliner
  - `readable` — reader-mode text extraction
  - `screenshot` — full-page PNG (requires Chrome/Chromium)
  - `pdf` — print-to-PDF (requires Chrome/Chromium)
  - `wayback` — submit the page to the Wayback Machine and store the snapshot URL (opt-in)
- Upload images / PDFs / HTML files as bookmarks, and attach your own SingleFile / PDF / screenshot files to existing links
- Import browser bookmarks (Netscape HTML from Chrome / Edge / Firefox) and JSON exports (including Linkwarden); folders become collections and duplicate URLs are skipped
- Export everything as JSON; all data files are human-readable and can be edited by hand before `git push`
- Optional AI tagging: suggest tags and a one-sentence summary through any OpenAI-compatible API (local Ollama or a hosted provider), then apply with one click
- Single-user password authentication, plus API keys for the bundled browser extension and other third-party clients
- Public collection sharing with a read-only page and RSS feed
- Bulk actions (tags, collection, pin, preserve, delete), highlights and annotations in the reader view
- Dark / light / system theme, PWA-installable, custom icons for links and collections
- Background sync and automatic push after writes; concurrent edits are merged semantically (newest `updatedAt` wins)

## How it works

```
Browser ──HTTP──> RepoMarks service ──git pull/push──> data repository (GitHub/Gitea/GitLab)
                       │
                       ├── local clone (DATA_DIR)
                       ├── in-memory index (search / tags / collections)
                       └── archives/ (html.gz, txt.gz, png, pdf)
```

On write: files are updated, committed locally, then pushed asynchronously. If the push is rejected (the remote moved ahead), the service fetches and merges; conflicts in `links/*.jsonl` and `collections.json` are resolved semantically (union of records by `id`, newest `updatedAt` wins) and the push is retried. In single-user use conflicts are rare.

## Data layout in the repository

```
meta.json               repository metadata
collections.json        collections (JSON array)
links/0000.jsonl        link shards, 1000 records per file, one JSON record per line
links/0001.jsonl
archives/<id>.html.gz   preserved HTML
archives/<id>.txt.gz    reader-mode text
archives/<id>.png       screenshot
archives/<id>.pdf       PDF print
```

> Why sharded JSONL: 10,000 links fit in ~10 files, so clones stay fast; adding or editing a link produces a one-line diff; and the files remain readable, greppable, and editable in any text editor.

## Quick start

### 1. Prepare a data repository

1. Create a **private** repository on GitHub / Gitea / GitLab (it can be empty), e.g. `link-data`
2. Create a minimal access token — see [Access tokens](#access-tokens)
3. Note the repository URL, e.g. `https://github.com/you/link-data.git`

### 2. Run with Node

```bash
cp .env.example .env
# edit .env: at minimum REPO_URL, GIT_TOKEN, AUTH_PASSWORD
npm install
npm run build
npm start
```

Open `http://localhost:3000` and sign in with `AUTH_PASSWORD`.

### 3. Run with Docker (recommended)

Use the published image (amd64 / arm64):

```bash
cp .env.example .env
# edit .env with your repository information
docker compose up -d
```

Or build from source:

```bash
docker compose up -d --build
```

Without compose:

```bash
docker run -d --name repomarks -p 3000:3000 \
  -e REPO_URL=https://github.com/you/link-data.git \
  -e GIT_TOKEN=github_pat_xxx \
  -e AUTH_PASSWORD=your-password \
  -v "$PWD/data:/data" \
  ghcr.io/repomarks/repomarks:latest
```

The image is Alpine-based and ships with `git` and `chromium`, so full-fidelity preservation (single-file HTML, screenshots, PDFs) works out of the box. Data is stored in `./data`.

Image tags: `latest` (latest release), `vX.Y.Z` / `vX.Y` (versions), `main`, `sha-xxxxxxxx`.

## Access tokens

The service reads and writes the data repository over HTTPS using a token. The token is stored only in `.env` (git-ignored) and is never written into `.git/config`, the browser, or the data repository.

### GitHub (fine-grained token recommended)

1. Open https://github.com/settings/personal-access-tokens/new
   (or: avatar → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token)
2. **Token name**: anything, e.g. `repomarks`
3. **Expiration**: 90 days or a custom value; regenerate and update `.env` when it expires
4. **Repository access**: `Only select repositories` → select only your data repository
5. **Permissions → Repository permissions → Contents**: `Read and write`
   (`Metadata` becomes read-only automatically; leave every other permission at `No access`)
6. Click **Generate token** and copy `github_pat_...` (shown only once) into `GIT_TOKEN`
7. Keep `GIT_USERNAME=x-access-token` (the default)

> Classic tokens (https://github.com/settings/tokens/new, `repo` scope) also work, but they grant access to all your repositories. Prefer fine-grained tokens.

### Gitea

1. Avatar → Settings → Applications → Manage Access Tokens
   (or `https://your-gitea.example.com/user/settings/applications`)
2. Name it anything and select only `repository` **Read and Write**
3. Copy the generated token into `GIT_TOKEN`
4. Set `GIT_USERNAME` to your Gitea username

### GitLab

1. Avatar → Edit profile → Access tokens
   (or https://gitlab.com/-/user_settings/personal_access_tokens)
2. Select the **`write_repository`** scope (this includes `read_repository`), set an expiry
3. Copy the token into `GIT_TOKEN`
4. Set `GIT_USERNAME=oauth2`

### SSH instead of a token

Generate or reuse a key pair, then set:

```ini
REPO_URL=git@github.com:you/link-data.git
GIT_SSH_KEY=/path/to/id_ed25519    # mount the key into the container for Docker deployments
GIT_TOKEN=                          # leave empty
```

### Security notes

- Grant the token access to this one data repository only, with the minimum permissions
- If a token leaks, revoke it on the platform, generate a new one, update `.env`, and restart the service
- Keep the data repository private, and do not expose the service directly to the internet; put it behind a reverse proxy if needed

## Development

```bash
npm install
npm run dev        # backend on :3000 (tsx watch) + frontend on :5173 (Vite, /api proxied)
npm run typecheck
npm run build
npm run smoke      # smoke tests: core git sync + HTTP API (uses temporary bare repos, safe)
```

An end-to-end test against a real GitHub repository is also available (it writes test data to the given repo):

```bash
# REPO_URL must point to a test repository, GIT_TOKEN needs Contents read/write on it
REPO_URL=https://github.com/you/link-data-test.git GIT_TOKEN=xxx node scripts/github-e2e.mjs
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `REPO_URL` | required | Data repository URL (HTTPS or SSH) |
| `GIT_TOKEN` | - | HTTPS access token; leave empty for SSH |
| `GIT_USERNAME` | `x-access-token` | HTTPS username: keep the default for GitHub, use your username for Gitea, `oauth2` for GitLab |
| `GIT_BRANCH` | `main` | Branch |
| `GIT_SSH_KEY` | - | Path to the SSH private key (SSH only) |
| `DATA_DIR` | `./data` | Local clone directory (`/data` in Docker) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address |
| `AUTH_PASSWORD` | - | Login password; leaving it empty disables authentication (not recommended) |
| `SESSION_SECRET` | derived | Session signing secret; derived from password + repo URL when empty |
| `SHARD_SIZE` | `1000` | Records per JSONL shard |
| `SYNC_INTERVAL` | `60` | Background sync interval in seconds; `0` disables it |
| `FETCH_TIMEOUT` | `15000` | Metadata fetch timeout in milliseconds |
| `ARCHIVE_ENGINE` | `auto` | `auto` / `singlefile` / `basic` / `off` |
| `ARCHIVE_FORMATS` | `html,readable,screenshot,pdf` | Enabled preservation formats (comma-separated; `wayback` is also accepted) |
| `ARCHIVE_WAYBACK` | `false` | Submit pages to the Wayback Machine |
| `ARCHIVE_BROWSER_PATH` | auto-detected | Path to Chrome/Chromium (for full archives and screenshots/PDFs) |
| `ARCHIVE_BROWSER_ARGS` | - | Extra browser arguments, comma-separated (`--no-sandbox,--disable-dev-shm-usage` in Docker) |
| `ARCHIVE_TIMEOUT` | `90000` | Timeout per preservation operation in milliseconds |
| `AI_BASE_URL` | - | OpenAI-compatible API base URL (e.g. `https://api.openai.com/v1`); leave empty to disable AI features |
| `AI_API_KEY` | - | API key for the AI provider (optional for local Ollama) |
| `AI_MODEL` | - | Model name, e.g. `gpt-4o-mini` or `llama3.1` |
| `AI_TIMEOUT` | `30000` | AI request timeout in milliseconds |
| `ALLOW_PRIVATE_URLS` | `false` | Allow fetching private/internal addresses (disabled to prevent SSRF) |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `RepoMarks` / `repomarks@localhost` | Commit author for data repository commits |

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Log in with `{password}` |
| GET | `/api/links` | Search with `q`, `collection`, `tag`, `archived`, `sort`, `order`, `page`, `perPage` |
| POST | `/api/links` | Create a link; `fetchMetadata: false` skips metadata scraping |
| PATCH / DELETE | `/api/links/:id` | Update / delete a link |
| POST | `/api/links/:id/archive` | Start preservation (asynchronous) |
| GET | `/api/links/:id/archive` | View the HTML archive; add `?format=readable\|screenshot\|pdf` for other formats |
| POST | `/api/links/:id/refetch` | Re-scrape metadata |
| GET / POST | `/api/collections` | List / create collections |
| PATCH / DELETE | `/api/collections/:id` | Update / delete a collection |
| GET | `/api/tags` | Tags with counts |
| POST | `/api/import` | Import `{html}` or `{json}` |
| GET | `/api/export` | Export all data as JSON |
| GET | `/api/status` | Repository status, sync state, preservation engine, stats |
| POST | `/api/sync` | Manual sync (pull + push) |

## Known limitations

- **Single user**: one deployment serves one password and one repository; run multiple instances for multiple users
- **Archive size**: full-fidelity archives can grow the repository; clone times grow with it, so preserve selectively
- **Without a browser**: the lightweight inliner is limited and complex SPAs may not render well; the Docker image ships with chromium
- **Conflict merging**: newest `updatedAt` wins per record; concurrent edits to the same fields are not merged field by field
- Anti-bot protections (403 / CAPTCHA) on target sites can make metadata scraping or preservation fail; the UI shows the error

## License

MIT
