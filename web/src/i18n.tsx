import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'repomarks-lang';

export const EN_TRANSLATIONS: Record<string, string> = {
  '关闭': 'Close',
  '取消': 'Cancel',
  '保存': 'Save',
  '保存修改': 'Save changes',
  '删除': 'Delete',
  '编辑': 'Edit',
  '返回': 'Back',
  '复制': 'Copy',
  '忽略': 'Dismiss',
  '生成': 'Generate',
  '撤销': 'Revoke',
  '添加': 'Add',
  '加载中…': 'Loading…',
  '导入中…': 'Importing…',
  '保存后立即抓取网页存档': 'Preserve the page right after saving',
  '数据存于 Git 仓库': 'Data lives in your Git repository',
  '全部链接': 'All links',
  '未分类': 'Uncategorized',
  '已存档': 'Preserved',
  '收藏夹': 'Collections',
  '标签': 'Tags',
  '新建收藏夹': 'New collection',
  '名称': 'Name',
  '建': 'Add',
  '暂无收藏夹': 'No collections yet',
  '导入书签': 'Import bookmarks',
  '仓库与状态': 'Repository & status',
  '退出登录': 'Sign out',
  '深色主题': 'Dark theme',
  '浅色主题': 'Light theme',
  '跟随系统': 'System theme',
  '状态加载中…': 'Loading status…',
  '正在同步…': 'Syncing…',
  '同步失败：{msg}': 'Sync failed: {msg}',
  '有待推送的本地提交': 'Local commits waiting to be pushed',
  '已同步 {time}': 'Synced {time}',
  '尚未同步': 'Not synced yet',
  '收藏夹设置': 'Collection settings',
  '确认': 'Confirm',
  '搜索标题、网址、描述、标签…': 'Search titles, URLs, descriptions, tags…',
  '最近更新': 'Recently updated',
  '最久未更新': 'Least recently updated',
  '最近添加': 'Recently added',
  '最早添加': 'Earliest added',
  '标题 A-Z': 'Title A-Z',
  '标题 Z-A': 'Title Z-A',
  '列表视图': 'List view',
  '网格视图': 'Grid view',
  '选择': 'Select',
  '退出选择': 'Exit selection',
  '全选本页': 'Select page',
  '上传文件': 'Upload file',
  '添加链接': 'Add link',
  '当前筛选：': 'Filters:',
  '搜索「{q}」': 'Search "{q}"',
  '标签「{tag}」': 'Tag "{tag}"',
  '收藏夹「{name}」': 'Collection "{name}"',
  '清除': 'Clear',
  '没有匹配的链接': 'No matching links',
  '还没有链接': 'No links yet',
  '试试调整关键词或筛选条件。': 'Try different keywords or filters.',
  '添加第一条链接，数据会自动提交到你的 Git 仓库。':
    'Add your first link — it will be committed to your Git repository automatically.',
  '已选 {count} 条': '{count} selected',
  '添加标签': 'Add tags',
  '移除标签': 'Remove tags',
  '移动到收藏夹…': 'Move to collection…',
  '置顶': 'Pin',
  '取消置顶': 'Unpin',
  '抓取存档': 'Preserve',
  '确定删除选中的 {count} 条链接吗？': 'Delete the {count} selected links?',
  '要添加的标签（逗号分隔）': 'Tags to add (comma separated)',
  '要移除的标签（逗号分隔）': 'Tags to remove (comma separated)',
  '上一页': 'Previous',
  '下一页': 'Next',
  '第 {page} / {pages} 页（共 {total} 条）': 'Page {page} of {pages} ({total} total)',
  '打开': 'Open',
  '详情': 'Details',
  '存档': 'Preserve',
  '重新存档': 'Preserve again',
  '存档中': 'Preserving',
  '存档中…': 'Preserving…',
  '存档失败': 'Preservation failed',
  '已置顶': 'Pinned',
  '本地文件': 'Local file',
  '确定删除「{title}」吗？': 'Delete "{title}"?',
  '抓取网页存档': 'Preserve page',
  '重新抓取网页存档': 'Preserve the page again',
  '打开原链接': 'Open original',
  '打开文件': 'Open file',
  '重新抓取元数据': 'Refetch metadata',
  '上传存档': 'Upload archive',
  'AI 标签与摘要': 'AI tags & summary',
  'AI 生成中…': 'Generating…',
  '网页存档': 'HTML',
  '阅读版': 'Reader',
  '截图': 'Screenshot',
  '高亮选中文字': 'Highlight selection',
  '已选 {count} 字': '{count} characters selected',
  '加载失败：{msg}': 'Failed to load: {msg}',
  '高亮与批注（{count}）': 'Highlights & notes ({count})',
  '在阅读版中定位': 'Locate in reader',
  '添加批注…': 'Add a note…',
  '部分格式失败：': 'Some formats failed:',
  'AI 建议': 'AI suggestions',
  '应用（合并标签、补全描述）': 'Apply (merge tags, fill description)',
  'Wayback Machine 快照': 'Wayback Machine snapshot',
  '存档时间：{date}': 'Captured at {date}',
  '信息': 'Details',
  '描述': 'Description',
  '备注': 'Notes',
  '站点': 'Site',
  '添加时间': 'Added',
  '更新时间': 'Updated',
  '存档状态': 'Preservation',
  '存档格式': 'Formats',
  '本地 ID': 'Local ID',
  '失败：{msg}': 'Failed: {msg}',
  '已存档（{engine}，{date}）': 'Preserved ({engine} at {date})',
  '未存档': 'Not preserved',
  '编辑链接': 'Edit link',
  '链接地址': 'URL',
  '正在抓取页面信息…': 'Fetching page metadata…',
  '自动抓取失败：{msg}（仍可手动填写）':
    'Metadata fetch failed: {msg} (you can fill it in manually)',
  '未命名页面': 'Untitled page',
  '标题': 'Title',
  '输入标签，回车添加': 'Type a tag and press Enter',
  '自己的笔记、摘录…': 'Your notes, excerpts…',
  '自定义图标（可选）': 'Custom icon (optional)',
  '留空使用网站 favicon，可填入图标图片 URL':
    'Leave empty to use the site favicon, or enter an image URL',
  '公开分享这个收藏夹（包含子收藏夹）': 'Share this collection publicly (including sub-collections)',
  '分享链接': 'Share link',
  '复制 RSS': 'Copy RSS',
  '任何人都可以通过这个链接浏览；RSS 可直接添加到阅读器。关闭开关后链接立即失效。':
    'Anyone with this link can browse the collection and subscribe via RSS. Turning the switch off invalidates the link immediately.',
  '保存后会生成分享链接。': 'A share link will be generated after saving.',
  '删除收藏夹「{name}」？其中的链接会变为未分类。':
    'Delete collection "{name}"? Its links will become uncategorized.',
  '上级收藏夹': 'Parent collection',
  '（顶级）': '(top level)',
  '图标图片 URL，留空显示颜色圆点': 'Icon image URL; leave empty to show a color dot',
  '支持浏览器导出的书签 HTML 文件（Chrome / Edge / Firefox），以及 JSON 格式（如 Linkwarden 导出）。书签目录会转换为收藏夹，重复链接会自动跳过。':
    'Import HTML bookmarks exported from browsers (Chrome / Edge / Firefox) or JSON files (e.g. Linkwarden exports). Folders become collections and duplicate links are skipped.',
  '点击选择文件，或拖拽到这里': 'Click to choose a file, or drop it here',
  '{size} KB，点击更换文件': '{size} KB · click to change',
  '默认收藏夹（用于无目录的书签）': 'Default collection (for bookmarks without a folder)',
  '开始导入': 'Start import',
  '导入完成：新增 {added} 条链接，跳过 {skipped} 条重复，新建 {collections} 个收藏夹。':
    'Import complete: {added} links added, {skipped} duplicates skipped, {collections} collections created.',
  '导出数据': 'Export data',
  'JSON 格式说明': 'JSON format',
  'Git 仓库': 'Git repository',
  '远端地址': 'Remote',
  '分支': 'Branch',
  '当前提交': 'Current commit',
  '最近提交': 'Last commit',
  '本地/远端差异': 'Local vs remote',
  '待推送 {ahead} 个提交，待拉取 {behind} 个提交':
    '{ahead} commits to push, {behind} commits to pull',
  '（工作区有未提交改动）': ' (uncommitted changes)',
  '上次同步': 'Last sync',
  '上次推送': 'Last push',
  '上次拉取': 'Last pull',
  '同步状态': 'Sync status',
  '正常': 'OK',
  '待推送': 'Pending push',
  '立即同步': 'Sync now',
  '导出 JSON': 'Export JSON',
  '已推送本地提交到远端。': 'Local commits pushed to the remote.',
  '已从远端拉取最新数据。': 'Pulled the latest data from the remote.',
  '已是最新状态。': 'Everything is up to date.',
  '已启用（存档与上传文件存 LFS 指针）':
    'Enabled (archives and uploads stored as LFS pointers)',
  '未启用': 'Disabled',
  '引擎': 'Engine',
  'single-file（完整存档）': 'single-file (full archive)',
  '轻量内联存档（无浏览器）': 'Lightweight inliner (no browser)',
  '已关闭': 'Disabled',
  '可用性': 'Availability',
  '可用': 'Available',
  '不可用：{reason}': 'Unavailable: {reason}',
  '浏览器': 'Browser',
  '已存档 {archived} / {links} 条，占用 {size}':
    '{archived} of {links} preserved, using {size}',
  '，失败 {n} 条': ', {n} failed',
  '安装 Chrome/Chromium 并设置 ARCHIVE_BROWSER_PATH，或安装浏览器后重启，可启用页面级完整存档。':
    'Install Chrome/Chromium and set ARCHIVE_BROWSER_PATH (or restart after installing a browser) to enable full-fidelity preservation.',
  'AI 标签（可选）': 'AI tagging (optional)',
  '已启用（模型 {model}）': 'Enabled (model {model})',
  '未配置': 'Not configured',
  '在 .env 中配置 AI_BASE_URL（OpenAI 兼容接口，如 https://api.openai.com/v1，或本地 Ollama 的 http://host.docker.internal:11434/v1）、AI_MODEL 和可选的 AI_API_KEY，重启后即可在链接详情页生成标签与摘要。':
    'Set AI_BASE_URL (any OpenAI-compatible endpoint, e.g. https://api.openai.com/v1 or a local Ollama at http://host.docker.internal:11434/v1), AI_MODEL and optionally AI_API_KEY in .env, then restart to enable tag and summary suggestions.',
  'API 密钥': 'API keys',
  '用于浏览器扩展、快捷指令、脚本等第三方客户端。请求时带上 Authorization: Bearer <key> 或 X-API-Key 头即可。':
    'For the browser extension, shortcuts, scripts and other clients. Send an Authorization: Bearer <key> or X-API-Key header with each request.',
  '密钥名称，例如 浏览器扩展': 'Key name, e.g. Browser extension',
  '暂无数据': 'No data',
  '新密钥（只显示这一次，请立即保存）：': 'New key (shown only once — save it now):',
  '创建于 {date}': 'Created {date}',
  '最近使用 {date}': 'Last used {date}',
  '尚未使用': 'Never used',
  '撤销这个 API 密钥？使用它的客户端会立即失效。':
    'Revoke this API key? Clients using it will stop working immediately.',
  '状态': 'Status',
  '数据统计': 'Statistics',
  '链接': 'Links',
  '服务运行': 'Uptime',
  '{h} 小时 {m} 分（Node {node}）': '{h} h {m} min (Node {node})',
  '仓库数据布局': 'Repository data layout',
  '直接编辑文件后提交推送，服务会自动拉取并加载；两端同时修改时按 id 合并，更新时间较新的记录优先。':
    'Edit the files by hand, commit and push — the service pulls and reloads automatically. Concurrent edits are merged by id, newest updatedAt wins.',
  '数据解析警告': 'Data parsing warnings',
  '稍后读': 'Read later',
  '未读': 'Unread',
  '已读': 'Read',
  '标记已读': 'Mark as read',
  '标记未读': 'Mark as unread',
  '上移': 'Move up',
  '下移': 'Move down',
  '颜色': 'Color',
  '重复链接': 'Duplicate link',
  '该链接已存在，你可以打开已有条目，或把当前填写的信息合并过去。':
    'This link already exists. Open the existing entry, or merge the current data into it.',
  '打开已有条目': 'Open existing',
  '合并到已有链接': 'Merge into existing',
  '保存小工具': 'Save bookmarklet',
  '把下面的链接拖到书签栏，点击即可保存当前页面：':
    'Drag the link below to your bookmarks bar, then click it to save the current page:',
  '复制代码': 'Copy code',
  '刷新超期存档': 'Refresh stale archives',
  '已触发 {count} 条链接的重新存档': 'Queued {count} links for re-preservation',
  '最大存档': 'Largest archives',
  '删除此格式': 'Delete this format',
  '确定删除该格式的存档吗？': 'Delete this saved format?',
  'RSS 订阅源': 'RSS feed URL',
  '立即同步订阅': 'Sync feed now',
  '分享密码': 'Share password',
  '密码留空表示不需要密码': 'Leave empty for no password',
  '有效期至': 'Expires at',
  '标签管理': 'Tags',
  '没有标签': 'No tags yet',
  '重命名': 'Rename',
  '合并到': 'Merge into',
  '删除标签': 'Delete tag',
  '标签名': 'Tag name',
  '确定删除标签「{tag}」吗？将从 {count} 条链接中移除。':
    'Delete tag "{tag}"? It will be removed from {count} links.',
  '已更新 {count} 条链接': 'Updated {count} links',
  '检查链接': 'Check links',
  '检查中…': 'Checking…',
  '已失效': 'Dead',
  '检查完成：{checked} 条链接，{dead} 条失效': 'Check complete: {checked} links, {dead} dead',
  'HTTP 状态': 'HTTP status',
  '最近检查': 'Last checked',
  '检查错误': 'Check error',
  '复制 Markdown': 'Copy Markdown',
  '已复制': 'Copied',
  '生成 Markdown 索引': 'Generate Markdown indexes',
  '导出 Markdown': 'Export Markdown',
  '已生成 {files} 个索引文件': 'Generated {files} index files',
  '搜索支持 site:、after:、before:、is:pinned、is:dead、is:archived':
    'Search supports site:, after:, before:, is:pinned, is:dead, is:archived',
  '公开分享页会显示这段描述': 'This description is shown on the public share page',
  '已复制到剪贴板': 'Copied to clipboard',
  '已保存': 'Saved',
  '复制链接': 'Copy link',
  '网络错误: {msg}': 'Network error: {msg}',
  '未登录': 'Not signed in',
  '菜单': 'Menu',
  '切换视图': 'Toggle view',
  '请输入链接地址': 'Please enter a URL',
  '读取文件失败': 'Failed to read the file',
  '读取文件失败：{msg}': 'Failed to read the file: {msg}',
  '文件不能超过 {size}MB': 'File cannot exceed {size} MB',
  '页面截图': 'Page screenshot',
  'PDF 存档': 'PDF archive',
  'meta.json            仓库元信息': 'meta.json              repository metadata',
  'collections.json     收藏夹': 'collections.json       collections',
  'links/0000.jsonl     链接分片（每片 1000 条，每行一条记录）':
    'links/0000.jsonl       link shards (1000 records per file, one JSON per line)',
  'archives/<id>.html.gz 网页存档（gzip 压缩的完整 HTML）':
    'archives/<id>.html.gz  preserved page (gzipped single-file HTML)',
  '访问密码': 'Password',
  '请输入 AUTH_PASSWORD': 'Enter AUTH_PASSWORD',
  '登录': 'Sign in',
};

function readStoredLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let text = lang === 'en' ? (EN_TRANSLATIONS[key] ?? key) : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'zh',
  setLang: () => undefined,
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value: I18nValue = {
    lang,
    setLang: setLangState,
    t: (key, vars) => translate(lang, key, vars),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
