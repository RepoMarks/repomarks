/** 把 API 返回的中文错误信息翻译成英文（跟随前端 x-ui-language / Accept-Language） */

const EXACT: Record<string, string> = {
  'URL 不能为空': 'URL is required',
  '出于安全考虑，默认禁止访问内网地址（可设置 ALLOW_PRIVATE_URLS=true 解除）':
    'Private/internal addresses are blocked by default (set ALLOW_PRIVATE_URLS=true to allow)',
  '不支持的格式（html / pdf / screenshot）': 'Unsupported format (html / pdf / screenshot)',
  '不能移动到自己的子收藏夹中': 'Cannot move a collection into its own descendant',
  '指定的收藏夹不存在': 'The specified collection does not exist',
  '缺少标签参数': 'Missing tags parameter',
  '没有可检查的链接': 'No links to check',
  '没有可操作的链接': 'No links to update',
  '未配置 AI：请设置 AI_BASE_URL 与 AI_MODEL':
    'AI is not configured: set AI_BASE_URL and AI_MODEL',
  '收藏夹不能作为自己的上级': 'A collection cannot be its own parent',
  '收藏夹名称不能为空': 'Collection name is required',
  '标签名不能为空': 'Tag name is required',
  '文件不能超过 25MB': 'File cannot exceed 25 MB',
  '文件不能超过 50MB': 'File cannot exceed 50 MB',
  '文件内容为空': 'File is empty',
  '单次导入不能超过 50000 条链接': 'A single import cannot exceed 50,000 links',
  '单次最多检查 500 条链接': 'At most 500 links per check',
  '单次最多操作 1000 条链接': 'At most 1000 links per bulk action',
  '仅支持 http/https 链接': 'Only http/https links are supported',
  '仅支持图片、PDF 或 HTML 文件': 'Only images, PDF or HTML files are supported',
  '请提供书签内容（html 或 json）': 'Provide bookmark content (html or json)',
  '高亮内容不能为空': 'Highlight text is required',
  '无效的图标地址': 'Invalid icon URL',
  '密码错误': 'Wrong password',
  '密钥不存在': 'API key not found',
  '收藏夹不存在': 'Collection not found',
  '分享不存在或未公开': 'Share not found or not public',
  '该链接不是本地文件': 'This link is not a local file',
  '链接不存在': 'Link not found',
  '高亮不存在': 'Highlight not found',
  '该链接已存在': 'This link already exists',
  '尝试次数过多，请稍后再试': 'Too many attempts, try again later',
  'AI 返回内容无法解析为 JSON': 'Could not parse the AI response as JSON',
  '该链接还没有存档': 'This link has no archive yet',
  '解析失败': 'Parsing failed',
  '服务器内部错误': 'Internal server error',
};

const PATTERNS: Array<[RegExp, string]> = [
  [/^无效的 URL: (.+)$/, 'Invalid URL: $1'],
  [/^缺少参数 (.+)$/, 'Missing parameter $1'],
  [/^抓取失败 HTTP (.+)$/, 'Fetch failed: HTTP $1'],
  [/^无法访问 (.+?): (.+)$/, 'Cannot reach $1: $2'],
  [/^该链接没有 (\w+) 格式的存档$/, 'No $1 archive for this link'],
  [/^不支持的存档格式: (.+)$/, 'Unsupported archive format: $1'],
  [/^AI 请求失败: HTTP (.+)$/, 'AI request failed: HTTP $1'],
  [/^AI 请求失败: (.+)$/, 'AI request failed: $1'],
];

export function wantsEnglish(language: string | undefined): boolean {
  return typeof language === 'string' && language.toLowerCase().startsWith('en');
}

export function translateServerMessage(message: string, language: string | undefined): string {
  if (!wantsEnglish(language)) return message;
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}
