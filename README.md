# RepoMarks

自部署的链接管理器（类似 [Linkwarden](https://github.com/linkwarden/linkwarden)），但**所有数据都存放在你自己的 Git 仓库里**（GitHub / Gitea / GitLab 均可），不需要数据库，也不依赖任何托管服务。

服务只做三件事：把数据仓库 clone 到本地、读写 JSON 文件、把改动 commit & push 回去。备份 = 仓库本身，历史 = git log，迁移 = 换个仓库地址。

## 功能

- 链接增删改查，自动抓取标题 / 描述 / 站点名 / favicon / OG 封面图
- 收藏夹（支持多级目录）、标签、置顶、备注、全文搜索（支持 `tag:` 前缀）
- **网页存档**：把页面保存为单文件 HTML（gzip 压缩）存进仓库，随时回看
  - 有 Chrome/Chromium 时用 [single-file-cli](https://github.com/gildas-lormeau/single-file-cli) 做完整存档（含图片/样式内联）
  - 没有浏览器时自动退化为轻量内联存档（样式内联、同源图片转 data URI）
- 导入浏览器书签（Chrome / Edge / Firefox 的 Netscape HTML）和 JSON（含 Linkwarden 导出），目录自动转收藏夹，重复链接跳过
- 导出 JSON；仓库里数据全是可读的 JSONL/Markdown 风格文本，可直接手改后 `git push`
- 单用户密码登录（`AUTH_PASSWORD`）
- 后台定时同步 + 写入后自动推送；多端同时修改时按 id 做语义合并（更新时间新者胜）

## 工作原理

```
浏览器 ──HTTP──> RepoMarks 服务 ──git pull/push──> 数据仓库 (GitHub/Gitea/...)
                     │
                     ├── 本地 clone (DATA_DIR)
                     ├── 内存索引（搜索/标签/收藏夹）
                     └── archives/ 网页存档 (html.gz)
```

写入流程：写文件 → `git commit` → 异步 push。push 被拒绝（远端有新提交）时自动 fetch + merge；`links/*.jsonl` 与 `collections.json` 冲突走语义合并（按 `id` 求并集，`updatedAt` 较新的记录优先），合并后再重试 push。单用户场景下基本不会产生冲突。

## 数据仓库里的结构

```
meta.json              仓库元信息
collections.json       收藏夹（JSON 数组）
links/0000.jsonl       链接分片，每片 1000 条，每行一条 JSON 记录
links/0001.jsonl
archives/<id>.html.gz  网页存档（gzip 压缩的单文件 HTML）
```

> 为什么用分片 JSONL：一万条链接只有 10 个文件，clone/pull 快；新增/修改只产生一行 diff；同时可读可 grep，也能直接用编辑器改。

## 快速开始

### 1. 准备数据仓库

1. 在 GitHub / Gitea / GitLab 新建一个**私有仓库**（可以是空仓库），例如 `link-data`
2. 创建访问令牌：
   - **GitHub**：Settings → Developer settings → Fine-grained tokens，只勾选该仓库的 `Contents: Read and write`
   - **Gitea**：设置 → 应用 → 生成令牌，权限选 `repository: Read and write`
3. 记下仓库地址，例如 `https://github.com/yourname/link-data.git`

### 2. 配置并启动

```bash
cp .env.example .env
# 编辑 .env，至少填写 REPO_URL、GIT_TOKEN、AUTH_PASSWORD
npm install
npm run build
npm start
```

打开 `http://localhost:3000`，输入 `AUTH_PASSWORD` 登录即可。

### 3. Docker 部署（推荐）

```bash
cp .env.example .env
# 编辑 .env 填仓库信息
docker compose up -d --build
```

镜像基于 Alpine，自带 `git` 和 `chromium`，网页存档默认就是完整存档模式，数据目录挂载在 `./data`。

## 开发

```bash
npm install
npm run dev        # 后端 :3000（tsx watch）+ 前端 :5173（Vite，/api 自动代理）
npm run typecheck
npm run build
npm run smoke      # 冒烟测试：核心同步流程 + HTTP 全链路（用临时 bare 仓库，不影响真实数据）
```

针对真实 GitHub 仓库的端到端测试（会创建临时数据目录，往指定仓库读写测试数据）：

```bash
# REPO_URL 指向一个用于测试的私有仓库，GIT_TOKEN 需有该仓库 Contents 读写权限
REPO_URL=https://github.com/you/link-data-test.git GIT_TOKEN=xxx node scripts/github-e2e.mjs
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `REPO_URL` | 必填 | 数据仓库地址（https 或 ssh） |
| `GIT_TOKEN` | - | HTTPS 访问令牌；SSH 方式可留空 |
| `GIT_USERNAME` | `x-access-token` | HTTPS Basic 用户名，Gitea 用你的用户名 |
| `GIT_BRANCH` | `main` | 分支 |
| `GIT_SSH_KEY` | - | SSH 私钥路径（仅 SSH 方式） |
| `DATA_DIR` | `./data` | 本地 clone 目录（Docker 中为 `/data`） |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | 监听地址 |
| `AUTH_PASSWORD` | - | 访问密码，留空则不启用登录（不建议） |
| `SESSION_SECRET` | 派生值 | 会话签名密钥，留空则按密码+仓库地址派生 |
| `SHARD_SIZE` | `1000` | 每个 JSONL 分片的记录数 |
| `SYNC_INTERVAL` | `60` | 后台同步间隔（秒），`0` 表示关闭定时同步 |
| `FETCH_TIMEOUT` | `15000` | 抓取元数据超时（毫秒） |
| `ARCHIVE_ENGINE` | `auto` | `auto` / `singlefile` / `basic` / `off` |
| `ARCHIVE_BROWSER_PATH` | 自动探测 | Chrome/Chromium 可执行文件路径 |
| `ARCHIVE_BROWSER_ARGS` | - | 浏览器启动参数，逗号分隔（Docker 中为 `--no-sandbox,--disable-dev-shm-usage`） |
| `ARCHIVE_TIMEOUT` | `90000` | 单次存档超时（毫秒） |
| `ALLOW_PRIVATE_URLS` | `false` | 是否允许抓取内网地址（默认禁止，防 SSRF） |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | `RepoMarks` / `repomarks@localhost` | 提交作者信息 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录，body `{password}` |
| GET | `/api/links` | 搜索，参数 `q`、`collection`、`tag`、`archived`、`sort`、`order`、`page`、`perPage` |
| POST | `/api/links` | 新建链接，`fetchMetadata: false` 可跳过抓取 |
| PATCH / DELETE | `/api/links/:id` | 修改 / 删除 |
| POST | `/api/links/:id/archive` | 触发网页存档（异步） |
| GET | `/api/links/:id/archive` | 查看存档 HTML |
| POST | `/api/links/:id/refetch` | 重新抓取元数据 |
| GET / POST | `/api/collections` | 收藏夹列表 / 新建 |
| PATCH / DELETE | `/api/collections/:id` | 修改 / 删除 |
| GET | `/api/tags` | 标签及计数 |
| POST | `/api/import` | 导入，body `{html}` 或 `{json}` |
| GET | `/api/export` | 导出全部数据 JSON |
| GET | `/api/status` | 仓库状态、同步状态、存档引擎、统计 |
| POST | `/api/sync` | 手动同步（pull + push） |

## 已知限制

- **单用户**：一份部署对应一个密码、一个仓库；多人协作场景建议拆多个实例
- **存档体积**：完整存档会让仓库变大（取决于网页），仓库膨胀后 clone 会变慢；可以只对重要链接存档
- **无浏览器时**：轻量存档的内联质量有限，复杂的 SPA 页面效果一般；Docker 镜像已内置 chromium
- **冲突合并**：按 `updatedAt` 新者胜，同一字段在两端的并发修改不会逐字段合并
- 抓取目标站点的反爬（403/验证码）会导致元数据或存档失败，界面会显示失败原因

## License

MIT
