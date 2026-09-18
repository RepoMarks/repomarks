<div align="center">
  <img src="docs/logo.png" width="112" alt="RepoMarks logo" />

  # RepoMarks

  **进化版书签管理 —— 数据存进你自己的 Git 仓库。**

  不需要数据库，不依赖托管后端。链接、网页存档、高亮批注都以纯文本/文件形式保存在你自己的仓库里。

  [![Docker](https://github.com/RepoMarks/repomarks/actions/workflows/docker.yml/badge.svg)](https://github.com/RepoMarks/repomarks/actions/workflows/docker.yml)
  ![Version](https://img.shields.io/github/package-json/v/RepoMarks/repomarks)
  ![License](https://img.shields.io/github/license/RepoMarks/repomarks)
  ![Stars](https://img.shields.io/github/stars/RepoMarks/repomarks)

  [English](README.md) · [路线图](ROADMAP.md) · [浏览器扩展](extension/) · [快速开始](#-快速开始)

  <img src="docs/logo.png" width="0" height="0" alt="" />
</div>

---

## 💡 为什么用 RepoMarks？

大多数书签工具把数据存在自己的数据库里，RepoMarks 把它存在**你的 Git 仓库**里：

- **存储完全属于你** —— 服务只做 clone、改文件、push。备份就是 `git clone`，历史就是 `git log`，迁移只是改一个地址
- **文件可读可改** —— 链接是 JSONL、收藏夹是 JSON、网页存档是 gzip 后的单文件 HTML，旁边还有截图和 PDF；可以直接 grep、diff、手改
- **天然多设备** —— 每个实例拉取/推送同一个仓库，冲突按记录合并（`updatedAt` 新者胜）
- **没有额外基础设施** —— 没有 Postgres、Redis、对象存储；一个容器 + 一个私有仓库就够了

## ✨ 功能

**📥 收集**
- 粘贴 URL 自动抓取标题、描述、站点名、favicon 和 OG 封面图
- 导入浏览器书签（Chrome / Edge / Firefox 导出的 HTML）与 JSON（含 Linkwarden 导出）
- 图片 / PDF / HTML 可上传为书签，也可给已有链接上传自己的 SingleFile / PDF / 截图存档
- 浏览器扩展（侧边栏 + 右键菜单）、书签小工具、PWA 分享目标、手机"分享到应用"

**🏛️ 存档**
- 多种格式一并存入仓库：单文件 **HTML**、**阅读版**正文、整页**截图**、**PDF**，可选提交 **Wayback Machine**
- 自动为 `archives/**`、`files/**` 启用 Git LFS，clone 依然轻快
- 定时重新存档过期页面；支持按格式清理，以及历史瘦身脚本

**📖 阅读与批注**
- 阅读版正文提取，5 种颜色高亮 + 批注，点击回到原文位置
- 归档全文搜索（索引存仓库）与命中摘要，支持 `site:`、`after:`、`before:`、`is:pinned`、`is:dead`、`is:read` 等语法
- 稍后读队列与未读/已读状态；批量打标签、移动、置顶、存档、删除

**🗂️ 整理与检索**
- 多级收藏夹（颜色、自定义图标、手动排序）；标签重命名 / 合并 / 删除
- 置顶、备注、自定义图标、重复链接检测与合并
- 失效链接检测（记录 HTTP 状态与检查时间）

**🌐 分享与同步**
- 收藏夹公开分享：只读页面 + RSS，可加**密码与有效期**
- 外部 RSS 订阅源自动收纳进指定收藏夹
- Linkwarden 兼容的 `/api/v1` 接口（Floccus 等客户端可直接接入）；按客户端发放 **API 密钥**
- 导出 JSON / Markdown，并生成 `index/*.md` 收藏夹索引，方便在 GitHub 上浏览

**🤖 AI（可选）**
- 通过任意 OpenAI 兼容接口生成标签与摘要
- 语义搜索与"书签问答"，向量索引同样存在仓库里

**🛠️ 运维**
- 单密码登录、深色/浅色/跟随系统主题、可安装为 PWA、中英文界面
- Docker healthcheck、`/api/health`、后台定时同步、反向代理子路径（`BASE_PATH`）

## 🚀 快速开始

### 1. 创建数据仓库

在 GitHub / Gitea / GitLab 新建一个**私有空仓库**，例如 `link-data`。

### 2. 启动服务

```bash
# 克隆本项目后：
cp .env.example .env      # 填写 REPO_URL、GIT_TOKEN、AUTH_PASSWORD
docker compose up -d
```

打开 `http://localhost:3000` 登录即可。镜像内置 `git`、`git-lfs` 与 `chromium`，完整存档开箱可用。

<details>
<summary>不用 Docker 运行</summary>

```bash
npm install && npm run build && npm start
```
需要 Node 20+；`git-lfs` 可选（用于 LFS 存储）。
</details>

<details>
<summary>直接 docker run</summary>

```bash
docker run -d --name repomarks -p 3000:3000 \
  -e REPO_URL=https://github.com/you/link-data.git \
  -e GIT_TOKEN=github_pat_xxx \
  -e AUTH_PASSWORD=你的密码 \
  -v "$PWD/data:/data" \
  ghcr.io/repomarks/repomarks:latest
```
镜像标签：`latest`、`vX.Y.Z`、`main`、`sha-xxxxxxxx`。
</details>

### 3. 创建访问令牌

服务通过 HTTPS + 最小权限令牌读写仓库，令牌只保存在 `.env`，不会写进 `.git/config`。

<details>
<summary><b>GitHub</b>（推荐 Fine-grained token）</summary>

1. 打开 <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** 选 `Only select repositories`，只勾选数据仓库
3. **Permissions → Contents** 设为 `Read and write`，其它保持 `No access`
4. 生成后复制 `github_pat_...` 到 `GIT_TOKEN`；`GIT_USERNAME` 保持默认 `x-access-token`

*Classic token（`repo` 范围）也能用，但权限覆盖你名下所有仓库。*
</details>

<details>
<summary><b>Gitea</b></summary>

1. 头像 → 设置 → 应用 → 管理 Access Tokens
2. 权限勾选 `repository` 的 **Read and Write**
3. 令牌填入 `GIT_TOKEN`，`GIT_USERNAME` 填你的用户名
</details>

<details>
<summary><b>GitLab</b></summary>

1. 头像 → Edit profile → Access tokens → 勾选 `write_repository`
2. 令牌填入 `GIT_TOKEN`，设置 `GIT_USERNAME=oauth2`
</details>

<details>
<summary><b>用 SSH 代替令牌</b></summary>

```ini
REPO_URL=git@github.com:you/link-data.git
GIT_SSH_KEY=/path/to/id_ed25519   # Docker 部署需挂载进容器
GIT_TOKEN=
```
</details>

## ⚙️ 工作原理

```
浏览器 ──HTTP──▶ RepoMarks ──git pull/push──▶ 数据仓库 (GitHub / Gitea / GitLab)
                    │
                    ├── 本地 clone (DATA_DIR)
                    ├── 内存索引（搜索、标签、向量）
                    └── archives/ · files/ · index/（LFS 跟踪）
```

每次写入都会先更新文件并本地提交，再在后台推送。推送被拒时自动 fetch + merge：`links/*.jsonl` 与 `collections.json` 按记录合并（`id` 并集，`updatedAt` 新者胜）。后台轮询会把其它设备（或你手动在仓库里）的改动拉下来。

## 🗃️ 仓库结构

```
meta.json                仓库元信息
collections.json         收藏夹
links/0000.jsonl         链接分片（每片 1000 条，每行一条 JSON）
archives/<id>.html.gz    单文件 HTML 存档（gzip）
archives/<id>.txt.gz     阅读版正文
archives/<id>.png        整页截图
archives/<id>.pdf        PDF
files/<id>.<ext>         上传的文件
index/search.jsonl       全文索引
index/embeddings.jsonl   AI 向量
index/*.md               生成的收藏夹索引
```

<details>
<summary><b>环境变量</b></summary>

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `REPO_URL` | 必填 | 数据仓库地址（HTTPS 或 SSH） |
| `GIT_TOKEN` | - | HTTPS 访问令牌；SSH 方式留空 |
| `GIT_USERNAME` | `x-access-token` | GitHub 保持默认 · Gitea 填用户名 · GitLab 填 `oauth2` |
| `GIT_BRANCH` | `main` | 分支 |
| `GIT_SSH_KEY` | - | SSH 私钥路径 |
| `GIT_LFS` | `auto` | `auto` / `true` / `false`，`archives/**` 与 `files/**` 走 LFS |
| `DATA_DIR` | `./data` | 本地 clone 目录（Docker 中为 `/data`） |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | 监听地址 |
| `BASE_PATH` | - | 反向代理子路径，例如 `/repomarks` |
| `AUTH_PASSWORD` | - | 登录密码，留空则不启用登录 |
| `SESSION_SECRET` | 派生值 | 会话签名密钥 |
| `SHARD_SIZE` | `1000` | 每个 JSONL 分片的记录数 |
| `SYNC_INTERVAL` | `60` | 后台同步间隔（秒） |
| `FETCH_TIMEOUT` | `15000` | 元数据抓取超时（毫秒） |
| `ARCHIVE_ENGINE` | `auto` | `auto` / `singlefile` / `basic` / `off` |
| `ARCHIVE_FORMATS` | `html,readable,screenshot,pdf` | 存档格式（`wayback` 需显式开启） |
| `ARCHIVE_WAYBACK` | `false` | 提交页面到 Wayback Machine |
| `ARCHIVE_BROWSER_PATH` | 自动探测 | Chrome/Chromium 路径 |
| `ARCHIVE_BROWSER_ARGS` | - | 浏览器参数（Docker 用 `--no-sandbox,--disable-dev-shm-usage`） |
| `ARCHIVE_TIMEOUT` | `90000` | 单次存档超时（毫秒） |
| `REFRESH_ARCHIVE_DAYS` / `REFRESH_ARCHIVE_LIMIT` | `0` / `5` | 超过 N 天的存档自动重新抓取 |
| `FEED_SYNC_INTERVAL_HOURS` | `0` | 每 N 小时同步收藏夹的 RSS 订阅源 |
| `FULLTEXT_INDEX` / `FULLTEXT_MAX_CHARS` | `true` / `2000` | 全文索引开关与每条链接的索引字符数 |
| `ALLOW_PRIVATE_URLS` | `false` | 允许抓取内网地址 |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | - | AI 功能的 OpenAI 兼容接口 |
| `AI_EMBEDDING_MODEL` | - | 语义搜索的向量模型 |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `RepoMarks` / `repomarks@localhost` | 提交作者 |

</details>

<details>
<summary><b>REST API</b></summary>

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录 `{password}` |
| GET | `/api/links` | 搜索（`q`、`collection`、`tag`、`archived`、`read`、`sort`、`order`、`page`、`perPage`） |
| POST | `/api/links` | 新建链接（`fetchMetadata: false` 跳过抓取） |
| POST | `/api/links/bulk` | 批量 `addTags` / `removeTags` / `setCollection` / `pin` / `read` / `archive` / `delete` |
| POST | `/api/links/check` | 失效链接检查（可选 `ids`） |
| PATCH / DELETE | `/api/links/:id` | 修改 / 删除 |
| POST | `/api/links/:id/archive` | 触发存档（异步） |
| GET | `/api/links/:id/archive` | 查看存档（`?format=readable\|screenshot\|pdf`） |
| POST | `/api/links/:id/ai` | AI 标签与摘要 |
| POST | `/api/ai/embed` / `/api/ai/search` / `/api/ai/chat` | 语义索引、语义搜索、书签问答 |
| POST | `/api/collections/:id/feed/sync` | 同步收藏夹的 RSS 订阅源 |
| GET / PATCH / DELETE | `/api/collections` | 收藏夹 |
| PATCH / DELETE | `/api/tags/:tag` | 重命名 / 删除标签 |
| POST | `/api/import` · GET `/api/export?format=markdown` | 导入 / 导出 |
| GET | `/api/health` · `/api/status` · POST `/api/sync` | 健康检查、状态、手动同步 |
| — | `/api/v1/*` | Linkwarden 兼容接口（API 密钥认证） |

认证方式：会话 Cookie，或 `Authorization: Bearer <API 密钥>` / `X-API-Key`。
</details>

## 🧩 客户端

- **浏览器扩展** —— [`extension/`](extension/)：弹窗、侧边栏、右键菜单、`Ctrl+Shift+S`
- **API 密钥** —— 设置 → API 密钥，供脚本、快捷指令和第三方应用使用
- **Floccus 等** —— 把 Linkwarden 兼容客户端指向 `/api/v1`
- **书签小工具** —— 在设置页把"保存小工具"拖到书签栏
- **PWA** —— 浏览器安装到桌面/主屏，分享目标可直接接收手机分享的链接

## 🧪 开发

```bash
npm install
npm run dev        # 后端 :3000（tsx watch）+ 前端 :5173（Vite）
npm run typecheck
npm run build
npm run smoke      # 核心同步 + HTTP 全链路冒烟测试（使用临时 bare 仓库）
```

`scripts/` 里还有实用脚本：`migrate-to-lfs.mjs`、`repo-slim.mjs`、`github-e2e.mjs`、`check-i18n.ts`、`make-icons.mjs`。

## ⚠️ 已知限制

- **单用户** —— 一份部署对应一个密码、一个仓库；多人使用建议各自部署实例
- **冲突合并** —— 按记录整体合并（`updatedAt` 新者胜），不做字段级合并
- **仓库体积** —— 存档会持续增长；请配合 Git LFS、按格式清理与 `scripts/repo-slim.mjs`
- **无浏览器环境** —— 轻量内联存档效果有限；Docker 镜像已内置 Chromium
- **反爬页面** —— 403/验证码会导致抓取或存档失败，界面会显示具体原因

## 📄 License

[MIT](LICENSE)
